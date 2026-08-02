/**
 * Does the LLM rerank stage actually improve relevance? Graded judgments.
 *
 *   pnpm eval:relevance
 *   pnpm eval:relevance -- --k 10 --judge anthropic/claude-sonnet-4.6
 *
 * WHY THIS EXISTS
 *
 * Every number this harness has produced so far measures REACH — where items
 * rank, how many slots resolve, which vendors appear. None of it says whether
 * the results are any good. An item climbing 38,000 places for "victorian
 * parlor" is not evidence it belongs there.
 *
 * `runTextMode` is two stages: an embedding shortlist of 50, then an LLM rerank
 * down to 24 (lib/search-modes.ts). The shortlist's recall ceiling is measured
 * (eval-search.ts). The rerank's contribution has never been measured at all —
 * so nobody can tell whether tuning `RERANK_MODEL_DEFAULT` or the rerank prompt
 * would help, hurt, or do nothing.
 *
 * METHOD — pooled graded relevance, the standard IR shape
 *
 * For each scene query, take the top k of the raw embedding order and the top k
 * after rerank. Pool the union, judge every pooled item 0-3 against a rubric,
 * then score both orderings with nDCG@k over the same judgments. Pooling means
 * one judgment set scores both systems, so the comparison is paired rather than
 * two independent estimates.
 *
 * WHAT LIMITS IT
 *
 * The judge is an LLM, not a set decorator. It sees name, category and
 * enrichment facets — the same text the retriever embedded — so it cannot catch
 * a mislabelled item, and it shares blind spots with the thing it is grading.
 * Treat these as relative scores between two orderings, not absolute quality.
 * A human-graded set would supersede this; it does not exist yet.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { shortlistByEmbedding } from '../lib/search-index';
import { runSearch } from '../lib/search-modes';
import { ndcg, percentile } from '../lib/eval/metrics';
import type { PropItem } from '../lib/types';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SCENES_FILE = path.join(process.cwd(), 'eval', 'scene-queries.json');

const JUDGE_SYSTEM = `You grade how well a rental prop matches a production designer's scene brief.

For each candidate, output a relevance grade:

3 = hero fit. Would plausibly be chosen for this scene without hesitation.
2 = plausible. Fits the era/style/mood; a designer would consider it.
1 = marginal. Same broad category or vaguely compatible, but wrong period, wrong
    register, or generic filler.
0 = irrelevant. Wrong object, wrong world, or nothing to do with the brief.

Judge the OBJECT against the SCENE, not the wording. A 1970s rattan chair for
"70s apartment" is a 3 even if no word overlaps. A "vintage lamp" with no era or
style signal is a 1, not a 2 — absence of evidence is not a match.

Be strict. Most catalog items are a 0 or 1 for any given scene. Do not spread
grades to look balanced.

Respond with ONLY a JSON object: { "grades": { "<id>": <0-3>, ... } }
Every id you were given must appear exactly once.`;

type Judged = Map<string, number>;

async function callOpenRouter(body: Record<string, unknown>): Promise<{ text: string; cost: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...body, usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { cost?: number };
  };
  return { text: data.choices?.[0]?.message?.content ?? '', cost: data.usage?.cost ?? 0 };
}

/** One line per candidate — the same facets the retriever saw, nothing more. */
function describe(item: PropItem): string {
  const facets = [
    item.style?.join(','),
    item.era,
    item.materials?.join(','),
    item.colors?.join(','),
    item.vibes?.join(','),
    item.settingType?.join(','),
  ]
    .filter(Boolean)
    .join(' | ');
  const desc = item.description ? ' — ' + item.description.slice(0, 120) : '';
  return `${item.id} | ${item.category}${item.subcategory ? '/' + item.subcategory : ''} | ${item.name}${facets ? ' [' + facets + ']' : ''}${desc}`;
}

async function judgePool(query: string, pool: PropItem[], model: string): Promise<{ judged: Judged; cost: number }> {
  const { text, cost } = await callOpenRouter({
    model,
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: `SCENE BRIEF: ${query}\n\nCANDIDATES (${pool.length}):\n${pool.map(describe).join('\n')}` },
    ],
  });
  const judged: Judged = new Map();
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned) as { grades?: Record<string, unknown> };
    for (const [id, g] of Object.entries(parsed.grades ?? {})) {
      const n = Number(g);
      if (Number.isFinite(n)) judged.set(id, Math.max(0, Math.min(3, Math.round(n))));
    }
  } catch {
    /* leave empty; caller reports coverage */
  }
  return { judged, cost };
}

async function main() {
  const argv = process.argv.slice(2);
  const kIdx = argv.indexOf('--k');
  const k = kIdx >= 0 ? Number(argv[kIdx + 1]) : 10;
  const jIdx = argv.indexOf('--judge');
  const judgeModel = jIdx >= 0 ? argv[jIdx + 1] : 'anthropic/claude-sonnet-4.6';

  const lIdx = argv.indexOf('--limit');
  const all = JSON.parse(await fs.readFile(SCENES_FILE, 'utf8')) as string[];
  const scenes = lIdx >= 0 ? all.slice(0, Number(argv[lIdx + 1])) : all;
  console.log(`scenes=${scenes.length}  k=${k}  judge=${judgeModel}\n`);

  let spend = 0;
  const embedNdcg: number[] = [];
  const rerankNdcg: number[] = [];
  const rows: Array<{ q: string; e: number; r: number; pool: number; covered: number }> = [];

  for (const query of scenes) {
    // Stage 1 order: raw nearest neighbours, no LLM involved.
    const shortlist = await shortlistByEmbedding(query, 50);
    const embedOrder = shortlist.slice(0, k).map((s) => s.item);

    // Stage 2 order: the same shortlist after the rerank the app actually runs.
    const result = await runSearch({ query, attachments: [], mode: 'text' });
    const rerankOrder = result.matches.slice(0, k).map((m) => m.item);

    // Pool the union so one judgment set scores both orderings.
    const pool = new Map<string, PropItem>();
    for (const it of [...embedOrder, ...rerankOrder]) pool.set(it.id, it);
    const poolArr = [...pool.values()];

    const { judged, cost } = await judgePool(query, poolArr, judgeModel);
    spend += cost;

    const grade = (it: PropItem) => judged.get(it.id) ?? 0;
    const e = ndcg(embedOrder.map(grade), k);
    const r = ndcg(rerankOrder.map(grade), k);
    embedNdcg.push(e);
    rerankNdcg.push(r);
    rows.push({ q: query, e, r, pool: poolArr.length, covered: judged.size });

    console.log(
      `  ${query.padEnd(28)} embed ${e.toFixed(3)}   rerank ${r.toFixed(3)}   ${r > e ? '+' : r < e ? '-' : '='}   pool ${poolArr.length}`,
    );
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const wins = rows.filter((x) => x.r > x.e).length;
  const losses = rows.filter((x) => x.r < x.e).length;

  console.log(`\n=== nDCG@${k} over ${scenes.length} scene queries ===`);
  console.log(`  embedding order   mean ${mean(embedNdcg).toFixed(4)}   median ${percentile(embedNdcg, 50).toFixed(4)}`);
  console.log(`  after rerank      mean ${mean(rerankNdcg).toFixed(4)}   median ${percentile(rerankNdcg, 50).toFixed(4)}`);
  console.log(`  delta             ${(mean(rerankNdcg) - mean(embedNdcg) >= 0 ? '+' : '') + (mean(rerankNdcg) - mean(embedNdcg)).toFixed(4)}`);
  console.log(`  rerank better on  ${wins}/${scenes.length}   worse on ${losses}   tied ${scenes.length - wins - losses}`);

  const uncovered = rows.filter((x) => x.covered < x.pool);
  if (uncovered.length) {
    console.log(`\n  note: ${uncovered.length} queries had ungraded pool items (counted as 0)`);
  }
  console.log(`\n=== judge spend ===\n  $${spend.toFixed(4)} over ${scenes.length} calls`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
