import { describe, expect, it } from 'vitest';
import { categoryHref, countSelected, parseFilters, toggleFilter } from './category-filters';

// The URL grammar of the category filter rail: comma lists per attribute key,
// OR within a group, groups AND; and the links that toggle one value.

describe('parseFilters', () => {
  it('reads each known key as a trimmed, deduped comma list and ignores the rest', () => {
    expect(
      parseFilters({ era: '1920s', style: ' industrial, nautical ,industrial', q: 'brass', vendor: 'x' }),
    ).toEqual({ era: ['1920s'], style: ['industrial', 'nautical'] });
  });

  it('takes the first of a repeated key and drops empty keys', () => {
    expect(parseFilters({ colors: ['black,gray', 'red'], vibes: '', tags: ' , ' })).toEqual({
      colors: ['black', 'gray'],
    });
  });

  it('caps values per group at twelve and each value at sixty characters', () => {
    const many = Array.from({ length: 20 }, (_, i) => `v${i}`).join(',');
    expect(parseFilters({ tags: many }).tags).toHaveLength(12);
    expect(parseFilters({ tags: 'x'.repeat(100) }).tags).toEqual(['x'.repeat(60)]);
  });
});

describe('categoryHref', () => {
  it('is the bare category when nothing is selected', () => {
    expect(categoryHref('lighting', {})).toBe('/category/lighting');
    expect(categoryHref('lighting', { q: '  ', filters: {} })).toBe('/category/lighting');
  });

  it('carries the query and each group as a comma list, in group order', () => {
    expect(
      categoryHref('lighting', { q: 'brass lamp', filters: { colors: ['black', 'gray'], era: ['1920s'] } }),
    ).toBe('/category/lighting?q=brass+lamp&era=1920s&colors=black%2Cgray');
  });
});

describe('toggleFilter', () => {
  it('adds a value, removes a present one, and drops an emptied group', () => {
    const a = toggleFilter({}, 'style', 'industrial');
    expect(a).toEqual({ style: ['industrial'] });
    const b = toggleFilter(a, 'style', 'nautical');
    expect(b).toEqual({ style: ['industrial', 'nautical'] });
    const c = toggleFilter(b, 'style', 'industrial');
    expect(c).toEqual({ style: ['nautical'] });
    expect(toggleFilter(c, 'style', 'nautical')).toEqual({});
  });

  it('does not mutate its input', () => {
    const before = { era: ['1920s'] };
    toggleFilter(before, 'era', '1930s');
    expect(before).toEqual({ era: ['1920s'] });
  });
});

describe('countSelected', () => {
  it('sums the values across groups', () => {
    expect(countSelected({})).toBe(0);
    expect(countSelected({ era: ['1920s'], colors: ['black', 'gray'] })).toBe(3);
  });
});
