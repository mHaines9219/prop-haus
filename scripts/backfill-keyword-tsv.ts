/**
 * Drive the chunked keyword_tsv backfill against the live catalog.
 *
 *   pnpm db:backfill-keyword-tsv --once            # ONE chunk, then stop and report
 *   pnpm db:backfill-keyword-tsv                   # loop until 0 rows remain
 *   pnpm db:backfill-keyword-tsv --chunk 500       # smaller chunks
 *   pnpm db:backfill-keyword-tsv --pause 250       # ms of idle between chunks
 *
 * WHY THE LOOP IS HERE AND NOT IN SQL
 *
 * `supabase db push` wraps each migration in a transaction, so a procedure with
 * explicit COMMIT between chunks fails with "invalid transaction termination".
 * Driving the loop from outside gives one transaction per chunk for free, and
 * two things a procedure could not:
 *
 *   - Per-chunk timing printed as it goes, so `--once` sizes the operation on
 *     the machine that can actually fail before the loop is allowed to run.
 *   - A resumable job with no bookkeeping. `where keyword_tsv is null` is the
 *     progress marker, so interrupting this script is safe and re-running it
 *     continues from wherever it stopped.
 *
 * WHY THIS SCRIPT EXISTS AT ALL
 *
 * The first version of this change did the column, the trigger, a 90,816-row
 * backfill and the RPC rewrite in one transaction. On live that backfill ran the
 * full 15 minutes, was cancelled by the statement timeout, and while it ran it
 * saturated I/O hard enough that ordinary anon reads of catalog_items returned
 * 57014 for roughly three minutes — home, browse, category and item detail all
 * degraded. Nothing partial survived, but the site was hurt for the duration.
 *
 * So this script does not just chunk the work, it WATCHES THE THING THAT BROKE.
 * Between chunks it issues the same plain anon read that failed during the
 * incident, and it aborts the whole run the first time that read fails or
 * crosses a latency ceiling. A backfill that cannot tell it is hurting the site
 * is the tool I actually needed and did not have.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Rows per chunk. 2000 is a starting point, not a measured value — size with --once. */
const DEFAULT_CHUNK = 2000;
/** Abort if the health read exceeds this. The incident sat at 3300-4200ms before failing. */
const HEALTH_CEILING_MS = 1500;
/** Consecutive health failures tolerated. One is enough: this is a backfill, not a deploy. */
const HEALTH_STRIKES = 1;

type Args = { once: boolean; chunk: number; pause: number };

function parseArgs(argv: string[]): Args {
  const num = (flag: string, fallback: number) => {
    const i = argv.indexOf(flag);
    if (i === -1) return fallback;
    const v = Number(argv[i + 1]);
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`${flag} needs a positive number, got ${argv[i + 1] ?? '(nothing)'}`);
    }
    return v;
  };
  return {
    once: argv.includes('--once'),
    chunk: num('--chunk', DEFAULT_CHUNK),
    pause: num('--pause', 0),
  };
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required — the chunk function is service_role only',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The anon client, deliberately separate. The health check has to run as the
 * public read path does — with the browser-published key, through the same view
 * and the same RLS — or it is not measuring what broke.
 */
function anonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required for the health check');
  return createClient(url, key, { auth: { persistSession: false } });
}

type Health = { ok: boolean; ms: number; detail: string };

async function readHealth(anon: SupabaseClient): Promise<Health> {
  const started = Date.now();
  // The exact shape that returned 500/57014 during the incident: a plain
  // indexed read of one row through the public view.
  const { error } = await anon.from('catalog_items').select('id').limit(1);
  const ms = Date.now() - started;
  if (error) return { ok: false, ms, detail: `${error.code ?? 'error'} ${error.message}` };
  if (ms > HEALTH_CEILING_MS) return { ok: false, ms, detail: `over ${HEALTH_CEILING_MS}ms ceiling` };
  return { ok: true, ms, detail: 'ok' };
}

async function remaining(db: SupabaseClient): Promise<number | null> {
  // Not exposed through the Data API: catalog_items omits keyword_tsv by design,
  // so there is no anon-visible way to count unfilled rows and no reason to add
  // one. The chunk function returning 0 is the completion signal instead.
  const { count, error } = await db
    .from('catalog_items')
    .select('id', { count: 'exact', head: true });
  if (error) return null;
  return count ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();
  const anon = anonClient();

  const total = await remaining(db);
  console.log(
    `\nkeyword_tsv backfill · chunk ${args.chunk}` +
      (args.pause ? ` · pause ${args.pause}ms` : '') +
      (args.once ? ' · SINGLE CHUNK (sizing run)' : '') +
      (total === null ? '' : ` · catalog ${total.toLocaleString()} rows`),
  );

  const pre = await readHealth(anon);
  console.log(`  read health before   ${pre.ms}ms  ${pre.detail}`);
  if (!pre.ok) {
    console.error('\nABORT: the public read path is already unhealthy. Not adding load to it.');
    process.exit(1);
  }

  let filled = 0;
  let chunks = 0;
  let strikes = 0;
  const durations: number[] = [];

  for (;;) {
    const started = Date.now();
    const { data, error } = await db.rpc('backfill_keyword_tsv_chunk', { chunk_size: args.chunk });
    const ms = Date.now() - started;

    if (error) {
      console.error(`\nchunk ${chunks + 1} FAILED after ${ms}ms: ${error.code ?? ''} ${error.message}`);
      console.error('Nothing partial survives a failed chunk — that chunk was one transaction.');
      console.error(`Progress so far: ${filled.toLocaleString()} rows in ${chunks} chunks. Re-run to continue.`);
      process.exit(1);
    }

    const n = Number(data ?? 0);
    chunks += 1;
    filled += n;
    durations.push(ms);

    const health = await readHealth(anon);
    console.log(
      `  chunk ${String(chunks).padStart(3)}  ${String(n).padStart(5)} rows  ${String(ms).padStart(6)}ms` +
        `  · total ${filled.toLocaleString().padStart(7)}` +
        `  · read ${String(health.ms).padStart(5)}ms ${health.ok ? 'ok' : 'DEGRADED ' + health.detail}`,
    );

    if (!health.ok) {
      strikes += 1;
      if (strikes >= HEALTH_STRIKES) {
        console.error(
          `\nSTOPPING: the public read path degraded (${health.detail}). This is the failure the` +
            `\nchunked design exists to prevent, so it stops rather than pushing through.`,
        );
        console.error(`Filled ${filled.toLocaleString()} rows in ${chunks} chunks. Re-run with a smaller --chunk.`);
        process.exit(1);
      }
    } else {
      strikes = 0;
    }

    if (n === 0) {
      console.log('\nBackfill complete — the chunk function reports 0 rows remaining.');
      break;
    }
    if (args.once) {
      const projected = total === null ? null : Math.ceil(total / args.chunk);
      console.log(
        `\nSizing run done. ${n} rows in ${ms}ms.` +
          (projected === null ? '' : ` At this rate the full backfill is ~${projected} chunks, ~${Math.round((projected * ms) / 1000)}s of database work.`) +
          '\nRe-run without --once to complete it.',
      );
      return;
    }
    if (args.pause) await new Promise((r) => setTimeout(r, args.pause));
  }

  const slowest = Math.max(...durations);
  const totalMs = durations.reduce((a, b) => a + b, 0);
  console.log(
    `  ${filled.toLocaleString()} rows · ${chunks} chunks · ${(totalMs / 1000).toFixed(1)}s total · slowest chunk ${slowest}ms`,
  );
  console.log('\nNext: `supabase db push` applies 20260802170100, which asserts 0 nulls before switching the RPC over.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
