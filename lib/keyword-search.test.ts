import { describe, expect, it } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';
import { keywordSearch } from './keyword-search';
import type { PropItem } from './types';

/**
 * Literal lookup beside the AI search. What matters: every token must hit
 * (AND), exact values outrank word hits outrank substrings, the phrase bonus
 * pulls "mid century" together, and the chips only name fields worth showing.
 */

function bare(over: Partial<PropItem> = {}): PropItem {
  return makePropItem({
    name: 'Untitled',
    category: 'other',
    subcategory: undefined,
    description: undefined,
    era: undefined,
    style: [],
    materials: [],
    colors: [],
    vibes: [],
    tags: [],
    ...over,
  });
}

const ids = (matches: ReturnType<typeof keywordSearch>) => matches.map((m) => m.item.id);

describe('query handling', () => {
  it('returns nothing for an empty or whitespace query', () => {
    const items = [bare({ sourceId: '1', name: 'Lamp' })];
    expect(keywordSearch(items, '')).toEqual([]);
    expect(keywordSearch(items, '   ')).toEqual([]);
  });

  it('returns nothing from an empty catalog', () => {
    expect(keywordSearch([], 'lamp')).toEqual([]);
  });

  it('normalizes case, underscores and hyphens on both sides', () => {
    const items = [bare({ sourceId: '1', name: 'Table', era: 'mid-century' })];
    expect(ids(keywordSearch(items, 'MID_Century'))).toEqual(['omega-1']);
    expect(ids(keywordSearch(items, 'mid-century'))).toEqual(['omega-1']);
  });

  it('does not throw on regex metacharacters in a token', () => {
    const items = [bare({ sourceId: '1', name: 'C++ Primer (1985)' })];
    expect(ids(keywordSearch(items, 'c++ (1985)'))).toEqual(['omega-1']);
  });
});

describe('AND semantics', () => {
  const items = [
    bare({ sourceId: 'both', name: 'Blue Couch' }),
    bare({ sourceId: 'couch', name: 'Red Couch' }),
    bare({ sourceId: 'blue', name: 'Blue Vase' }),
  ];

  it('requires every token to match somewhere on the item', () => {
    expect(ids(keywordSearch(items, 'blue couch'))).toEqual(['omega-both']);
  });

  it('lets different tokens match different fields', () => {
    const mixed = [bare({ sourceId: 'x', name: 'Couch', colors: ['blue'] })];
    expect(ids(keywordSearch(mixed, 'blue couch'))).toEqual(['omega-x']);
  });
});

describe('scoring', () => {
  it('ranks exact value over whole word over substring', () => {
    const items = [
      bare({ sourceId: 'sub', name: 'Lampshade' }),
      bare({ sourceId: 'word', name: 'Floor Lamp' }),
      bare({ sourceId: 'exact', name: 'Brass Torchiere', subcategory: 'lamp' }),
    ];
    const out = keywordSearch(items, 'lamp');
    expect(ids(out)).toEqual(['omega-exact', 'omega-word', 'omega-sub']);
    expect(out.map((m) => m.score)).toEqual([12.5, 9, 6]);
  });

  it('adds a phrase bonus when the whole query appears verbatim in one field', () => {
    const items = [
      bare({ sourceId: 'split', name: 'Mid Table', tags: ['century'] }),
      bare({ sourceId: 'phrase', name: 'Table', style: ['mid-century'] }),
    ];
    const out = keywordSearch(items, 'mid century');
    expect(ids(out)).toEqual(['omega-phrase', 'omega-split']);
    expect(out[0].score).toBe(20);
  });

  it('gives no phrase bonus to a single-token query', () => {
    const out = keywordSearch([bare({ sourceId: '1', style: ['retro'] })], 'retro');
    expect(out[0].score).toBe(10);
  });

  it('matches the vendor name at low weight without a chip', () => {
    const out = keywordSearch([bare({ sourceId: '1' })], 'omega');
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(1.5);
    expect(out[0].matchedVia).toEqual([]);
  });

  it('breaks score ties by name', () => {
    const items = [bare({ sourceId: 'z', name: 'Zebra Lamp' }), bare({ sourceId: 'a', name: 'Apple Lamp' })];
    expect(ids(keywordSearch(items, 'lamp'))).toEqual(['omega-a', 'omega-z']);
  });
});

describe('matchedVia chips', () => {
  it('names chip fields only, best weight first, at most four', () => {
    const item = bare({
      sourceId: '1',
      name: 'Red Chair',
      description: 'A red chair.',
      subcategory: 'red',
      tags: ['red wine'],
      style: ['red velvet'],
      colors: ['reddish'],
      vibes: ['red moody'],
      settingType: ['red room'],
    });
    const [match] = keywordSearch([item], 'red');
    expect(match.matchedVia).toEqual(['red', 'red wine', 'red velvet', 'reddish']);
  });

  it('never surfaces the name or description as a chip', () => {
    const [match] = keywordSearch([bare({ sourceId: '1', name: 'Lamp', description: 'a lamp' })], 'lamp');
    expect(match.matchedVia).toEqual([]);
  });

  it('collects chips across every token', () => {
    const [match] = keywordSearch([bare({ sourceId: '1', colors: ['blue'], tags: ['couch'] })], 'blue couch');
    expect(match.matchedVia.sort()).toEqual(['blue', 'couch']);
  });
});

describe('limit', () => {
  it('truncates the ranked list', () => {
    const items = ['a', 'b', 'c'].map((s) => bare({ sourceId: s, name: `Lamp ${s}` }));
    expect(keywordSearch(items, 'lamp', { limit: 2 })).toHaveLength(2);
    expect(keywordSearch(items, 'lamp', { limit: 0 })).toHaveLength(0);
    expect(keywordSearch(items, 'lamp')).toHaveLength(3);
  });
});
