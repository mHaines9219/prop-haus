import { describe, expect, it } from 'vitest';
import {
  anchorFor,
  assetIdFor,
  dimsMetresFor,
  hasRealDimensions,
  parseAssetId,
  spacelabCategoryFor,
  tagsFor,
} from './asset';

describe('assetIdFor / parseAssetId', () => {
  it('namespaces an item by vendor and vendor-side id', () => {
    expect(assetIdFor('ec', '12345')).toBe('prophaus:ec:12345');
  });

  it('escapes anything that would break a URL path or the id grammar', () => {
    // Vendor source ids are arbitrary — slugs, paths, ids with spaces. The
    // asset id ends up in a URL path and inside a scene file, so a raw colon
    // or slash would make it unparseable.
    const id = assetIdFor('hpr', 'chairs/wing back #3');
    expect(id).toBe('prophaus:hpr:chairs%2Fwing%20back%20%233');
    expect(id.split(':')).toHaveLength(3);
    expect(parseAssetId(id)).toEqual({ source: 'hpr', sourceId: 'chairs/wing back #3' });
  });

  it('round-trips every id it makes', () => {
    for (const sourceId of ['a', '1', 'a:b', 'a b', "quote'd", 'p%20', 'ünïcode']) {
      expect(parseAssetId(assetIdFor('ec', sourceId))).toEqual({ source: 'ec', sourceId });
    }
  });

  it('refuses ids that are not ours', () => {
    // Spacelab's own hand-authored assets carry no namespace, and a malformed
    // escape must not throw its way up through a route handler.
    expect(parseAssetId('couch-medium')).toBeNull();
    expect(parseAssetId('other:ec:1')).toBeNull();
    expect(parseAssetId('prophaus:ec:%ZZ')).toBeNull();
  });
});

describe('dimsMetresFor', () => {
  it('converts published inches to metres', () => {
    const dims = dimsMetresFor({ category: 'seating', dimensions: { width: 78.74, height: 39.37, depth: 19.685 } });
    expect(dims).toEqual({ w: 2, h: 1, d: 0.5 });
  });

  it('falls back per axis, so a partly measured item keeps its real numbers', () => {
    const dims = dimsMetresFor({ category: 'seating', dimensions: { width: 78.74 } });
    expect(dims.w).toBe(2); // published
    expect(dims.h).toBeCloseTo(32 / 39.37, 2); // seating fallback
    expect(dims.d).toBeCloseTo(34 / 39.37, 2);
  });

  it('uses the category placeholder when nothing was published', () => {
    const lamp = dimsMetresFor({ category: 'lighting' });
    const sofa = dimsMetresFor({ category: 'seating' });
    expect(lamp.h).toBeGreaterThan(lamp.w); // a lamp is tall and narrow
    expect(sofa.w).toBeGreaterThan(lamp.w);
  });

  it('falls back for an unknown or missing category rather than producing a zero box', () => {
    for (const dims of [dimsMetresFor({}), dimsMetresFor({ category: 'not-a-category' })]) {
      expect(dims.w).toBeGreaterThan(0);
      expect(dims.h).toBeGreaterThan(0);
      expect(dims.d).toBeGreaterThan(0);
    }
  });

  it('clamps nonsense so one bad parse cannot swallow the room', () => {
    const huge = dimsMetresFor({ dimensions: { width: 40000, height: 1, depth: 1 } });
    const zero = dimsMetresFor({ category: 'seating', dimensions: { width: 0, height: -5 } });
    expect(huge.w).toBe(12); // MAX_DIMENSION_M
    expect(zero.w).toBeGreaterThan(0); // 0 is treated as unpublished, not as 0 m
  });
});

describe('hasRealDimensions', () => {
  it('is true only when the vendor published all three axes', () => {
    expect(hasRealDimensions({ dimensions: { width: 10, height: 10, depth: 10 } })).toBe(true);
    expect(hasRealDimensions({ dimensions: { width: 10, height: 10 } })).toBe(false);
    expect(hasRealDimensions({})).toBe(false);
  });
});

describe('taxonomy', () => {
  it('maps our categories onto Spacelab’s six', () => {
    expect(spacelabCategoryFor('seating')).toBe('seating');
    expect(spacelabCategoryFor('tables-desks')).toBe('table');
    expect(spacelabCategoryFor('beds-bedroom')).toBe('bed');
    // Everything without an obvious home reads as decor, which is where
    // Spacelab's own catalog puts its miscellany.
    expect(spacelabCategoryFor('weapons-military')).toBe('decor');
    expect(spacelabCategoryFor(undefined)).toBe('decor');
  });

  it('anchors wall-hung categories to the wall', () => {
    expect(anchorFor('artwork-wall')).toBe('wall');
    expect(anchorFor('mirrors-decorative-objects')).toBe('wall');
    expect(anchorFor('seating')).toBe('floor');
    expect(anchorFor(undefined)).toBe('floor');
  });

  it('builds deduped, lowercased tags from the enrichment fields', () => {
    const tags = tagsFor({
      category: 'Seating',
      subcategory: 'Sofa',
      style: ['Mid-Century', 'mid-century'],
      era: '1960s',
      materials: ['Walnut'],
      colors: ['Olive'],
      tags: ['lounge'],
    });
    expect(tags).toContain('seating');
    expect(tags).toContain('mid-century');
    expect(tags.filter((t) => t === 'mid-century')).toHaveLength(1);
    expect(tags.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it('caps tags so one over-enriched item cannot dominate the catalog filter', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag-${i}`);
    expect(tagsFor({ tags: many })).toHaveLength(12);
  });
});
