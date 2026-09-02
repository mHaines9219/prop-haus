import { describe, expect, it } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';
import { isEnriched } from './strata';
import type { PropItem } from '../types';

/**
 * The eval splits the catalog by whether the enrichment pass touched an item.
 * A wrong answer here mislabels a whole stratum, so every facet is checked on
 * its own and the empty forms are pinned as "not enriched".
 */

const plain = (over: Partial<PropItem> = {}): PropItem =>
  makePropItem({
    style: undefined,
    era: undefined,
    materials: undefined,
    colors: undefined,
    vibes: undefined,
    settingType: undefined,
    genreFit: undefined,
    tags: undefined,
    ...over,
  });

describe('isEnriched', () => {
  it('is false with only name, category and description', () => {
    expect(isEnriched(plain())).toBe(false);
  });

  it.each<[string, Partial<PropItem>]>([
    ['style', { style: ['mcm'] }],
    ['era', { era: '1960s' }],
    ['materials', { materials: ['oak'] }],
    ['colors', { colors: ['red'] }],
    ['vibes', { vibes: ['cozy'] }],
    ['settingType', { settingType: ['office'] }],
    ['genreFit', { genreFit: ['western'] }],
    ['tags', { tags: ['lamp'] }],
  ])('is true on %s alone', (_, over) => {
    expect(isEnriched(plain(over))).toBe(true);
  });

  it('treats empty arrays and an empty era as not enriched', () => {
    expect(
      isEnriched(
        plain({ style: [], era: '', materials: [], colors: [], vibes: [], settingType: [], genreFit: [], tags: [] }),
      ),
    ).toBe(false);
  });
});
