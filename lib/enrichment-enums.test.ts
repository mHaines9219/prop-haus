import { describe, expect, it } from 'vitest';
import { COLORS, ENUM_LIST, ERAS, GENRE_FIT, MATERIALS, SETTING_TYPES, STYLES, VIBES } from './enrichment-enums';

/**
 * The controlled vocabulary the enricher, the vision pass and the search
 * filters all share. A duplicate or a non-slug entry here would silently split
 * a facet; a key mismatch in ENUM_LIST would drop a whole dimension.
 */

const LISTS = { STYLES, ERAS, MATERIALS, COLORS, VIBES, SETTING_TYPES, GENRE_FIT } as const;

describe('each vocabulary', () => {
  it.each(Object.entries(LISTS))('%s is non-empty, unique and slug-shaped', (_, list) => {
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
    for (const entry of list) expect(entry).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('ENUM_LIST', () => {
  it('maps the camelCase field names onto the same arrays', () => {
    expect(ENUM_LIST.style).toBe(STYLES);
    expect(ENUM_LIST.era).toBe(ERAS);
    expect(ENUM_LIST.materials).toBe(MATERIALS);
    expect(ENUM_LIST.colors).toBe(COLORS);
    expect(ENUM_LIST.vibes).toBe(VIBES);
    expect(ENUM_LIST.settingType).toBe(SETTING_TYPES);
    expect(ENUM_LIST.genreFit).toBe(GENRE_FIT);
    expect(Object.keys(ENUM_LIST)).toHaveLength(7);
  });
});

describe('eras', () => {
  it('covers every decade from the 1800s to the 2020s plus the catch-alls', () => {
    const decades = Array.from({ length: 23 }, (_, i) => `${1800 + i * 10}s`);
    for (const d of decades) expect(ERAS).toContain(d);
    expect(ERAS).toContain('pre-1900');
    expect(ERAS).toContain('timeless');
  });
});
