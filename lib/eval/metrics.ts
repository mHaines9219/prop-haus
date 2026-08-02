/**
 * Retrieval metrics for the search eval harness.
 *
 * Pure functions, no I/O — the scoring math is the part that has to be right,
 * so it lives apart from the runner and is unit-tested in `metrics.test.ts`.
 * This PR adds vitest, the repo's first test runner.
 *
 * Two failure modes matter and they need separate numbers:
 *
 *   - RECALL is the shortlist's job. `shortlistByEmbedding` returns k items out
 *     of ~96k; anything it misses is unrecoverable, because the reranker only
 *     ever sees the shortlist. Measured with hit-rate@k / recall@k.
 *   - PRECISION is the reranker's job — given a shortlist that does contain the
 *     right items, does it order them well. Measured with nDCG@k.
 *
 * A single blended score hides which stage regressed, which is exactly the
 * question anyone tuning this needs answered.
 */

/** Discounted cumulative gain over graded relevance, in rank order. */
export function dcg(relevances: number[], k: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(k, relevances.length); i++) {
    // log2(i + 2) because ranks are 0-indexed here: rank 1 => log2(2) => 1.
    sum += relevances[i] / Math.log2(i + 2);
  }
  return sum;
}

/**
 * Normalized DCG@k — DCG of the returned order over DCG of the best possible
 * order of the same judgments. Returns 0 when no relevant item exists, since
 * there is no achievable gain to normalize against.
 */
export function ndcg(relevances: number[], k: number): number {
  const ideal = [...relevances].sort((a, b) => b - a);
  const idealDcg = dcg(ideal, k);
  if (idealDcg === 0) return 0;
  return dcg(relevances, k) / idealDcg;
}

/** Fraction of all known-relevant ids that appear in the top k of `ranked`. */
export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  let found = 0;
  for (const id of ranked.slice(0, k)) if (relevant.has(id)) found++;
  return found / relevant.size;
}

/**
 * 1-indexed rank of `targetId` in `ranked`, or null if absent. Null and a large
 * rank are different outcomes — absent means the shortlist ceiling cut it off,
 * so callers must not collapse them into one number.
 */
export function rankOf(ranked: string[], targetId: string): number | null {
  const i = ranked.indexOf(targetId);
  return i === -1 ? null : i + 1;
}

/**
 * Mean reciprocal rank. Misses contribute 0, which is the standard convention
 * and keeps MRR comparable across runs with different miss counts.
 */
export function mrr(ranks: Array<number | null>): number {
  if (ranks.length === 0) return 0;
  const sum = ranks.reduce<number>((n, r) => n + (r === null ? 0 : 1 / r), 0);
  return sum / ranks.length;
}

/** Share of queries where the target landed anywhere in the top k. */
export function hitRateAtK(ranks: Array<number | null>, k: number): number {
  if (ranks.length === 0) return 0;
  return ranks.filter((r) => r !== null && r <= k).length / ranks.length;
}

/**
 * Percentile over already-collected numbers, nearest-rank. Used for latency,
 * where the mean hides the tail that users actually complain about.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
