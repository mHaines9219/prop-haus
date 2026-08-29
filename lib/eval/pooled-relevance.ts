/**
 * Pooled graded relevance — the shared core for comparing two rankers.
 *
 * WHY THIS IS ONE MODULE RATHER THAN COPIED INTO EACH HARNESS
 *
 * Two harnesses need it: `eval-relevance.ts` (embedding order vs LLM rerank) and
 * `eval-keyword-ranking.ts` (in-memory keyword ranker vs the Postgres RPC). If
 * each carried its own rubric, the two would drift, and then a number from one
 * could not be compared with a number from the other — which is the whole point
 * of having numbers.
 *
 * THE METHOD
 *
 * For one query, take the top k from each ranker, pool the union, judge every
 * pooled item once, then score both orderings with nDCG@k over those same
 * judgments. Pooling makes the comparison PAIRED: one judgment set, two scores,
 * so a difference is attributable to ordering rather than to two independent
 * estimates of a moving target.
 *
 * WHAT LIMITS IT, AND THIS APPLIES TO EVERY CALLER
 *
 * The judge is an LLM, not a set decorator. It reads the same facet text the
 * rankers read, so it cannot catch a mislabelled item and it shares blind spots
 * with what it grades. That bias hits both sides EQUALLY, which is why the
 * comparison survives even where the absolute number is soft — but the absolute
 * number is not "search quality" and should not be quoted as one.
 *
 * Absolute nDCG also runs high by construction: the pool is the union of two
 * top-k lists that overlap heavily, so the "ideal" ordering is drawn from an
 * already-good set. It measures ordering WITHIN the candidates, not whether they
 * were the right candidates out of ~90k.
 */
import { ndcg } from './metrics';
import type { PropItem } from '../types';

export const JUDGE_SYSTEM = `You grade how well a rental prop matches a production designer's brief.

For each candidate, output a relevance grade:

3 = hero fit. Would plausibly be chosen for this brief without hesitation.
2 = plausible. Fits the era/style/mood; a designer would consider it.
1 = marginal. Same broad category or vaguely compatible, but wrong period, wrong
    register, or generic filler.
0 = irrelevant. Wrong object, wrong world, or nothing to do with the brief.

Judge the OBJECT against the BRIEF, not the wording. A 1970s rattan chair for
"70s apartment" is a 3 even if no word overlaps. A "vintage lamp" with no era or
style signal is a 1, not a 2 — absence of evidence is not a match.

Be strict. Most catalog items are a 0 or 1 for any given brief. Do not spread
grades to look balanced.

Respond with ONLY a JSON object: { "grades": { "<id>": <0-3>, ... } }
Every id you were given must appear exactly once.`;

export type Judged = Map<string, number>;

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(body: Record<string, unknown>): Promise<{ text: string; cost: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    // usage.include so a run reports what it actually cost rather than an estimate.
    body: JSON.stringify({ ...body, usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { cost?: number };
  };
  return { text: data.choices?.[0]?.message?.content ?? '', cost: data.usage?.cost ?? 0 };
}

/** One line per candidate — the same facets the rankers saw, nothing more. */
export function describe(item: PropItem): string {
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

export async function judgePool(
  brief: string,
  pool: PropItem[],
  model: string,
): Promise<{ judged: Judged; cost: number }> {
  const { text, cost } = await callOpenRouter({
    model,
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: `BRIEF: ${brief}\n\nCANDIDATES (${pool.length}):\n${pool.map(describe).join('\n')}` },
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
    /* leave empty; the caller reports judgment coverage so a parse failure is visible */
  }
  return { judged, cost };
}

/**
 * Score one ranker's ordering against a judgment set.
 *
 * An unjudged id scores 0 rather than being dropped. Dropping it would let a
 * ranker improve its own score by returning items the judge failed to grade,
 * which is the wrong incentive for an instrument to have.
 */
export function scoreOrdering(order: string[], judged: Judged, k: number): number {
  return ndcg(
    order.slice(0, k).map((id) => judged.get(id) ?? 0),
    k,
  );
}

/** Union of two orderings, in a stable order, for judging exactly once. */
export function poolUnion(a: string[], b: string[], k: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...a.slice(0, k), ...b.slice(0, k)]) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
