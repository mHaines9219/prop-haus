import { describe, expect, it } from 'vitest';
import { poolUnion, scoreOrdering } from './pooled-relevance';

/**
 * These pin the semantics `eval-relevance.ts` had inline before it moved onto
 * this shared core. The rewire is only safe if the shared functions behave the
 * way the local code did, and reading two snippets side by side is how people
 * convince themselves of things that are not true.
 */
describe('poolUnion', () => {
  it('preserves first-seen order across both lists', () => {
    expect(poolUnion(['a', 'b'], ['b', 'c'], 10)).toEqual(['a', 'b', 'c']);
  });

  it('dedupes without reordering — the old Map-insertion behaviour', () => {
    expect(poolUnion(['x', 'y', 'z'], ['z', 'y', 'x'], 10)).toEqual(['x', 'y', 'z']);
  });

  it('truncates each side to k before pooling', () => {
    expect(poolUnion(['a', 'b', 'c'], ['d', 'e', 'f'], 2)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('handles one side empty', () => {
    expect(poolUnion([], ['a'], 5)).toEqual(['a']);
  });
});

describe('scoreOrdering', () => {
  const judged = new Map([
    ['a', 3],
    ['b', 2],
    ['c', 0],
  ]);

  it('gives a perfect score to the ideal order', () => {
    expect(scoreOrdering(['a', 'b', 'c'], judged, 3)).toBeCloseTo(1, 10);
  });

  it('penalises putting the weakest item first', () => {
    expect(scoreOrdering(['c', 'b', 'a'], judged, 3)).toBeLessThan(1);
  });

  // The incentive that matters: a ranker must not be able to improve its score
  // by returning items the judge failed to grade.
  it('treats an unjudged id as 0 rather than dropping it', () => {
    const withGap = scoreOrdering(['a', 'unjudged', 'b'], judged, 3);
    const withoutGap = scoreOrdering(['a', 'b'], judged, 3);
    expect(withGap).toBeLessThan(withoutGap);
  });

  it('only considers the first k positions', () => {
    // 'a' beyond k cannot rescue an ordering that starts with a zero.
    expect(scoreOrdering(['c', 'a'], judged, 1)).toBe(0);
  });

  it('returns 0 when nothing in range was judged relevant', () => {
    expect(scoreOrdering(['c'], judged, 3)).toBe(0);
  });
});
