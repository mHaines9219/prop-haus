import { describe, expect, it } from 'vitest';
import { CATEGORIES, RULES, categoryName, mapToUnifiedCategory } from './categories';

/**
 * The rule order is the product: a word matched by the wrong rule sends
 * thousands of items into the wrong browse bucket. The examples the rule
 * comments cite are pinned here so a reorder shows up as a failure.
 */

describe('CATEGORIES', () => {
  it('has unique slugs and ends with the catch-all', () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.at(-1)).toBe('other');
  });

  it('every rule targets a known category and every category but other has a rule', () => {
    const slugs = new Set<string>(CATEGORIES.map((c) => c.slug));
    const targets = new Set<string>(RULES.map(([, slug]) => slug));
    for (const t of targets) expect(slugs.has(t)).toBe(true);
    for (const s of slugs) if (s !== 'other') expect(targets.has(s)).toBe(true);
  });
});

describe('categoryName', () => {
  it('resolves a slug to its display name', () => {
    expect(categoryName('tables-desks')).toBe('Tables & Desks');
  });

  it('echoes an unknown slug', () => {
    expect(categoryName('nope')).toBe('nope');
    expect(categoryName('')).toBe('');
  });
});

describe('mapToUnifiedCategory', () => {
  it('falls through to other on an empty or unmatched path', () => {
    expect(mapToUnifiedCategory([])).toBe('other');
    expect(mapToUnifiedCategory(['Zzyzx'])).toBe('other');
  });

  it('is case-insensitive and reads the whole path', () => {
    expect(mapToUnifiedCategory(['FURNITURE', 'Storage'])).toBe('storage-credenzas');
    expect(mapToUnifiedCategory(['Furniture', 'Sofas'])).toBe('seating');
  });

  it('matches plurals as whole words', () => {
    expect(mapToUnifiedCategory(['Bicycles'])).toBe('vehicles-transport');
    expect(mapToUnifiedCategory(['Bicycle'])).toBe('vehicles-transport');
    expect(mapToUnifiedCategory(['Accessories'])).toBe('mirrors-decorative-objects');
  });

  it.each([
    [['Sculpture, Bust Of Brutus'], 'sculptures'],
    [['Art', 'Painting, Fishing Boats'], 'artwork-wall'],
    [['Leopard Print Pillow'], 'linens-textiles'],
    [['Sconce, Crystal Dish And Drops'], 'lighting'],
    [['Light Green Teapot'], 'kitchen-tableware'],
    [['Textiles', 'Moroccan Rug'], 'rugs-floor'],
    [['Medical', 'Chair'], 'medical-anatomical'],
    [['Rifle'], 'weapons-military'],
    [['Neon Sign'], 'graphics-signage'],
    [['Desk Lamp'], 'lighting'],
    [['Office', 'Cubicle'], 'office'],
    [['Bath', 'Towels'], 'linens-textiles'],
    [['Toothbrush'], 'bed-bath'],
    [['Books'], 'accessories-hand-props'],
    [['Patio Umbrella'], 'outdoor-garden'],
    [['Bar Stool'], 'bars-counters'],
    [['Bed'], 'beds-bedroom'],
    [['Table'], 'tables-desks'],
    [['Christmas'], 'event-essentials'],
    [['Treadmill'], 'sports-recreation'],
    [['Ladder'], 'industrial-hardware'],
    [['Diner Booth'], 'specialized-environments'],
    [['Squib'], 'rigged-effects'],
    [['Fern Plant'], 'floral-plants'],
    [['Television'], 'electronics-tech'],
  ] as const)('%j → %s', (path, slug) => {
    expect(mapToUnifiedCategory([...path])).toBe(slug);
  });
});
