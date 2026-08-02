import { describe, expect, it } from 'vitest';
import { classifyQuery, words } from './query-shape';

// A small corpus standing in for the pooled candidates' field text.
const SAMPLE = [
  'Velvet Couch, tufted',
  'Brass Table Lamp',
  'Mid Century Modern Chair',
  'seating',
  'lighting',
  'blue',
];

describe('words', () => {
  it('splits on punctuation the way a tsvector would', () => {
    expect(words('Velvet Couch, tufted')).toEqual(['velvet', 'couch', 'tufted']);
  });

  it('lowercases and collapses separators', () => {
    expect(words('Mid-Century   MODERN')).toEqual(['mid', 'century', 'modern']);
  });
});

describe('classifyQuery', () => {
  it('calls a whole word exact-or-prefix', () => {
    const s = classifyQuery('couch', SAMPLE);
    expect(s.tokens[0].shape).toBe('exact-or-prefix');
    expect(s.substringShaped).toBe(false);
  });

  // `couc:*` reaches "couch", so this is fair to token search.
  it('calls a leading prefix exact-or-prefix', () => {
    expect(classifyQuery('couc', SAMPLE).tokens[0].shape).toBe('exact-or-prefix');
  });

  // The case that matters: `includes()` finds this, tsquery cannot.
  it('calls a mid-word substring substring-only', () => {
    const s = classifyQuery('ouc', SAMPLE);
    expect(s.tokens[0].shape).toBe('substring-only');
    expect(s.substringShaped).toBe(true);
  });

  it('calls a suffix substring-only', () => {
    expect(classifyQuery('entury', SAMPLE).tokens[0].shape).toBe('substring-only');
  });

  it('reports a token that matches nothing as unmatched, not as substring', () => {
    const s = classifyQuery('helicopter', SAMPLE);
    expect(s.tokens[0].shape).toBe('unmatched');
    // Unmatched is not unfair to either ranker — neither can find it.
    expect(s.substringShaped).toBe(false);
  });

  // A prefix match anywhere in the vocabulary rescues the token, even if some
  // other word contains it mid-word. Otherwise a common substring would label
  // half the query set unfair and the column would stop discriminating.
  it('prefers a prefix match over an incidental mid-word hit', () => {
    const s = classifyQuery('la', ['Brass Table Lamp', 'Inflatable']);
    expect(s.tokens[0].shape).toBe('exact-or-prefix');
  });

  it('flags a multi-token query when any single token is substring-only', () => {
    const s = classifyQuery('blue ouch', SAMPLE);
    expect(s.tokens.map((t) => t.shape)).toEqual(['exact-or-prefix', 'substring-only']);
    expect(s.substringShaped).toBe(true);
  });

  it('leaves substringShaped false when every token is reachable', () => {
    const s = classifyQuery('brass table lamp', SAMPLE);
    expect(s.tokens.every((t) => t.shape === 'exact-or-prefix')).toBe(true);
    expect(s.substringShaped).toBe(false);
  });
});
