import { describe, expect, it } from 'vitest';
import { dcg, hitRateAtK, mrr, ndcg, percentile, rankOf, recallAtK } from './metrics';

describe('dcg', () => {
  it('discounts by log2(rank + 1)', () => {
    // rank 1 => /1, rank 2 => /log2(3), rank 3 => /2
    expect(dcg([3, 2, 1], 3)).toBeCloseTo(3 + 2 / Math.log2(3) + 1 / 2, 10);
  });

  it('respects the k cutoff', () => {
    expect(dcg([1, 1, 1], 1)).toBe(1);
  });

  it('is 0 when nothing is relevant', () => {
    expect(dcg([0, 0, 0], 3)).toBe(0);
  });
});

describe('ndcg', () => {
  it('is 1 for an already-ideal ordering', () => {
    expect(ndcg([3, 2, 1], 3)).toBeCloseTo(1, 10);
  });

  it('penalises a reversed ordering', () => {
    expect(ndcg([1, 2, 3], 3)).toBeLessThan(1);
  });

  it('is 0 rather than NaN when no item is relevant', () => {
    expect(ndcg([0, 0], 2)).toBe(0);
  });
});

describe('recallAtK', () => {
  const relevant = new Set(['a', 'b', 'c']);

  it('counts only hits inside the cutoff', () => {
    expect(recallAtK(['a', 'x', 'b'], relevant, 2)).toBeCloseTo(1 / 3, 10);
    expect(recallAtK(['a', 'x', 'b'], relevant, 3)).toBeCloseTo(2 / 3, 10);
  });

  it('is 0 with no relevant set, not NaN', () => {
    expect(recallAtK(['a'], new Set(), 5)).toBe(0);
  });
});

describe('rankOf', () => {
  it('is 1-indexed', () => {
    expect(rankOf(['a', 'b'], 'a')).toBe(1);
    expect(rankOf(['a', 'b'], 'b')).toBe(2);
  });

  it('returns null for an absent id — distinct from a large rank', () => {
    expect(rankOf(['a', 'b'], 'zzz')).toBeNull();
  });
});

describe('mrr', () => {
  it('averages reciprocal ranks', () => {
    expect(mrr([1, 2])).toBeCloseTo((1 + 0.5) / 2, 10);
  });

  it('scores misses as 0 but still counts them in the denominator', () => {
    expect(mrr([1, null])).toBeCloseTo(0.5, 10);
  });

  it('is 0 for an empty run', () => {
    expect(mrr([])).toBe(0);
  });
});

describe('hitRateAtK', () => {
  it('counts ranks within k, excluding misses', () => {
    expect(hitRateAtK([1, 50, null, 200], 50)).toBeCloseTo(0.5, 10);
  });

  it('excludes a rank exactly past the cutoff', () => {
    expect(hitRateAtK([51], 50)).toBe(0);
  });
});

describe('percentile', () => {
  it('uses nearest-rank', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  });

  it('does not mutate the caller array', () => {
    const xs = [3, 1, 2];
    percentile(xs, 50);
    expect(xs).toEqual([3, 1, 2]);
  });

  it('is 0 for an empty sample', () => {
    expect(percentile([], 95)).toBe(0);
  });
});
