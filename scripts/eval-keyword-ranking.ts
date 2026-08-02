/**
 * In-memory keyword ranker vs the Postgres RPC — which ordering is better?
 *
 *   pnpm eval:keyword              # dry run: query shapes + in-memory top-k, free
 *   pnpm eval:keyword -- --db      # add the Postgres ordering and judge both
 *
 * WHY THIS EXISTS
 *
 * `app/api/keyword/route.ts` reads a local gitignored JSON file, so it cannot
 * leave a laptop. Replacing it with `search_catalog_keyword` changes the ordering
 * users see: top-10 agreement with the in-memory ranker was 4/10 on "couch".
 * That divergence is expected — six field weights collapse into four tsvector
 * labels — but "expected" is not "acceptable", and taste is not a tiebreak on
 * something a user looks at.
 *
 * So: pooled graded relevance. One judgment set, two scores, paired comparison.
 * The shared core is `lib/eval/pooled-relevance.ts` so this cannot drift from the
 * embedding-vs-rerank harness that uses the same rubric.
 *
 * WHAT THIS DOES NOT DECIDE
 *
 * Ship or no-ship. If the in-memory ordering wins, the alternative in production
 * is not the in-memory ranker — that path cannot be deployed at all — it is a
 * dead search box. This measures the size of the gap. Somebody else decides what
 * to do with it.
 *
 * AND IT DELIBERATELY DOES NOT CHASE AGREEMENT
 *
 * Agreement with the in-memory ordering is not the target. Tuning weights until
 * the numbers match would be fitting one instrument to another rather than to
 * relevance. The output reports both scores and the gap; it does not reward
 * similarity.
 *
 * THE COLUMN THAT PREVENTS A MISREADING
 *
 * `substr` flags queries token search structurally cannot serve — the in-memory
 * ranker matches with `includes()`, so "ouc" finds "couch" and no tsquery can.
 * A loss on a substring-shaped query is not a weighting problem, and the
 * tempting misreading is that it is, because weights are actionable. See
 * `lib/eval/query-shape.ts`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadCatalog } from '../lib/catalog';
import { keywordSearch } from '../lib/keyword-search';
import { judgePool, poolUnion, scoreOrdering } from '../lib/eval/pooled-relevance';
import { classifyQuery } from '../lib/eval/query-shape';
import { percentile } from '../lib/eval/metrics';
import type { PropItem } from '../lib/types';

const QUERIES_FILE = path.join(process.cwd(), 'eval', 'keyword-queries.json');

type Ordering = { ids: string[]; ms: number };

/** The ordering a user sees today, from the in-memory ranker. */
function inMemory(catalog: PropItem[], q: string, k: number): Ordering {
  const t0 = Date.now();
  const ids = keywordSearch(catalog, q)
    .slice(0, k)
    .map((m) => m.item.id);
  return { ids, ms: Date.now() - t0 };
}

/**
 * The ordering the Postgres RPC would give. Anon key only — the function is
 * granted to `anon` by the migration that introduces it, and this is a read.
 */
async function postgres(q: string, k: number): Promise<Ordering> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required for --db');
  const db = createClient(url, anon, { auth: { persistSession: false } });
  const t0 = Date.now();
  const { data, error } = await db.rpc('search_catalog_keyword', { q, max_results: k });
  const ms = Date.now() - t0;
  if (error) {
    throw new Error(
      `search_catalog_keyword failed (${error.code ?? '?'}): ${error.message}\n` +
        'If this is 404/PGRST202 the keyword migration is not applied yet, and there is\n' +
        'nothing to compare. If it is 42501 the function exists but execute is revoked.',
    );
  }
  return { ids: ((data ?? []) as Array<{ id: string }>).map((r) => r.id).slice(0, k), ms };
}

function overlap(a: string[], b: string[]): number {
  const s = new Set(b);
  return a.filter((id) => s.has(id)).length;
}

async function main() {
  const argv = process.argv.slice(2);
  const withDb = argv.includes('--db');
  const kIdx = argv.indexOf('--k');
  const k = kIdx >= 0 ? Number(argv[kIdx + 1]) : 10;
  const jIdx = argv.indexOf('--judge');
  const judgeModel = jIdx >= 0 ? argv[jIdx + 1] : 'anthropic/claude-sonnet-4.6';

  const catalog = await loadCatalog();
  if (catalog.length === 0) {
    console.error('Catalog is empty — run the pipeline first. Nothing to rank.');
    process.exit(1);
  }
  const byId = new Map(catalog.map((i) => [i.id, i]));
  const queries = JSON.parse(await fs.readFile(QUERIES_FILE, 'utf8')) as string[];
  console.log(`catalog ${catalog.length} · queries ${queries.length} · k=${k}${withDb ? ` · judge=${judgeModel}` : ''}`);

  // ---- dry run: costs nothing, and says what a real run would be measuring ---
  if (!withDb) {
    console.log('\nDRY RUN — no Postgres ordering, no judging, no spend.\n');
    console.log('query                 in-mem  ms    substr  token shapes');
    for (const q of queries) {
      const mem = inMemory(catalog, q, k);
      // Classify against the candidates in play, not the whole catalog: against
      // 90k items almost any string is a prefix of something and the label stops
      // discriminating.
      const sample = mem.ids
        .map((id) => byId.get(id))
        .filter((i): i is PropItem => Boolean(i))
        .flatMap((i) => [i.name, i.category, i.subcategory ?? '', ...(i.tags ?? []), ...(i.style ?? [])]);
      const shape = classifyQuery(q, sample);
      console.log(
        q.padEnd(22) +
          String(mem.ids.length).padStart(6) +
          String(mem.ms).padStart(5) +
          (shape.substringShaped ? '   YES ' : '    no ') +
          '   ' +
          shape.tokens.map((t) => `${t.token}:${t.shape}`).join(' '),
      );
    }
    console.log('\nRun with --db once the keyword migration is applied to compare and judge.');
    return;
  }

  // ---- paired comparison ----------------------------------------------------
  let spend = 0;
  const memScores: number[] = [];
  const pgScores: number[] = [];
  const memMs: number[] = [];
  const pgMs: number[] = [];
  const rows: Array<{ q: string; mem: number; pg: number; agree: number; substr: boolean; pool: number }> = [];

  for (const q of queries) {
    const mem = inMemory(catalog, q, k);
    const pg = await postgres(q, k);

    const pool = poolUnion(mem.ids, pg.ids, k)
      .map((id) => byId.get(id))
      .filter((i): i is PropItem => Boolean(i));

    // A pool of one side only cannot produce a paired comparison.
    if (pool.length === 0) {
      console.log(`  ${q.padEnd(22)} both orderings empty — skipped`);
      continue;
    }

    const { judged, cost } = await judgePool(q, pool, judgeModel);
    spend += cost;

    const shape = classifyQuery(q, pool.flatMap((i) => [i.name, i.category, i.subcategory ?? '']));
    const mScore = scoreOrdering(mem.ids, judged, k);
    const pScore = scoreOrdering(pg.ids, judged, k);

    memScores.push(mScore);
    pgScores.push(pScore);
    memMs.push(mem.ms);
    pgMs.push(pg.ms);
    rows.push({
      q,
      mem: mScore,
      pg: pScore,
      agree: overlap(mem.ids, pg.ids),
      substr: shape.substringShaped,
      pool: pool.length,
    });
  }

  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  console.log('\nquery                 in-mem   postgres    delta  agree  substr  pool');
  for (const r of rows) {
    const d = r.pg - r.mem;
    console.log(
      r.q.padEnd(22) +
        r.mem.toFixed(3).padStart(6) +
        r.pg.toFixed(3).padStart(11) +
        (d >= 0 ? '+' : '') + d.toFixed(3).padStart(8) +
        `${r.agree}/${k}`.padStart(7) +
        (r.substr ? '    YES' : '     no') +
        String(r.pool).padStart(6),
    );
  }

  const pgWins = rows.filter((r) => r.pg > r.mem).length;
  const memWins = rows.filter((r) => r.mem > r.pg).length;
  console.log(`\nmean nDCG@${k}   in-memory ${mean(memScores).toFixed(4)}   postgres ${mean(pgScores).toFixed(4)}`);
  console.log(`             delta ${(mean(pgScores) - mean(memScores)).toFixed(4)}`);
  console.log(`             postgres better on ${pgWins}/${rows.length} · in-memory better on ${memWins} · tied ${rows.length - pgWins - memWins}`);
  console.log(`latency      in-memory p50 ${percentile(memMs, 50)}ms · postgres p50 ${percentile(pgMs, 50)}ms`);

  // The losses that are NOT about weights, separated so nobody has to remember.
  const substrLosses = rows.filter((r) => r.mem > r.pg && r.substr);
  const realLosses = rows.filter((r) => r.mem > r.pg && !r.substr);
  console.log(`\nof ${memWins} in-memory wins: ${substrLosses.length} substring-shaped (token search cannot serve these at all)`);
  console.log(`                   ${realLosses.length} genuinely about ordering${realLosses.length ? ' — ' + realLosses.map((r) => r.q).join(', ') : ''}`);

  console.log(`\njudge spend $${spend.toFixed(4)}`);
  console.log(
    'Reminder: absolute nDCG runs high because the pool is the union of two top-k\n' +
      'lists. These are relative scores between two orderings, not search quality.',
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
