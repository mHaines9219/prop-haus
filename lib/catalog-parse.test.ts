import { describe, expect, it } from 'vitest';
import {
  describeRejections,
  parseCatalogItems,
  parseCatalogItemsStrict,
} from './catalog-parse';

/** A record that validates, so the tests exercise mixed input rather than all-bad. */
function validItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'omega:1',
    source: 'omega',
    sourceId: '1',
    name: 'Wingback Chair',
    category: 'seating',
    sourceCategoryPath: ['Furniture', 'Seating'],
    vendor: {
      id: 'omega',
      name: 'Omega Cinema Props',
      city: 'LA',
      sourceUrl: 'https://example.com/vendor',
    },
    images: ['https://example.com/a.jpg'],
    sourceUrl: 'https://example.com/item/1',
    scrapedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('parseCatalogItems', () => {
  it('keeps every valid record', () => {
    const report = parseCatalogItems([validItem(), validItem({ id: 'omega:2', sourceId: '2' })]);
    expect(report.items).toHaveLength(2);
    expect(report.dropped).toBe(0);
    expect(report.total).toBe(2);
    expect(report.reasons).toEqual([]);
  });

  // The whole reason this module exists: one bad record used to fail all ~90k.
  it('drops only the invalid records, not the array', () => {
    const report = parseCatalogItems([
      validItem(),
      validItem({ id: 'shag:1', source: 'shagcarpet', vendor: { ...validItem().vendor, id: 'shagcarpet' } }),
      validItem({ id: 'omega:3', sourceId: '3' }),
    ]);
    expect(report.items.map((i) => i.id)).toEqual(['omega:1', 'omega:3']);
    expect(report.dropped).toBe(1);
    expect(report.total).toBe(3);
  });

  it('names an unknown source, because that reason is actionable on sight', () => {
    const report = parseCatalogItems([validItem({ source: 'formdecor' })]);
    expect(report.reasons).toEqual([{ reason: 'unknown source "formdecor"', count: 1 }]);
  });

  it('groups reasons and orders them most frequent first', () => {
    const report = parseCatalogItems([
      validItem({ source: 'formdecor' }),
      validItem({ source: 'formdecor' }),
      validItem({ name: 42 }),
    ]);
    expect(report.reasons[0]).toEqual({ reason: 'unknown source "formdecor"', count: 2 });
    expect(report.reasons).toHaveLength(2);
    expect(report.reasons[1].count).toBe(1);
  });

  it('preserves input order among survivors', () => {
    const report = parseCatalogItems([
      validItem({ id: 'a' }),
      validItem({ source: 'nope' }),
      validItem({ id: 'b' }),
      validItem({ source: 'nope' }),
      validItem({ id: 'c' }),
    ]);
    expect(report.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('reports a non-array as malformed rather than throwing', () => {
    const report = parseCatalogItems({ items: [] });
    expect(report.malformed).toBe(true);
    expect(report.items).toEqual([]);
    expect(report.reasons[0].reason).toContain('not an array');
  });

  it('treats an empty array as valid and empty, not malformed', () => {
    const report = parseCatalogItems([]);
    expect(report.malformed).toBe(false);
    expect(report.reasons).toEqual([]);
  });
});

describe('describeRejections', () => {
  it('returns null when nothing was rejected', () => {
    expect(describeRejections(parseCatalogItems([validItem()]), 'catalog')).toBeNull();
  });

  it('names the label, the counts and the culprits', () => {
    const summary = describeRejections(
      parseCatalogItems([validItem(), validItem({ source: 'formdecor' })]),
      'catalog',
    );
    expect(summary).toBe('[catalog] dropped 1 of 2 invalid items — 1x unknown source "formdecor"');
  });
});

describe('parseCatalogItemsStrict', () => {
  it('returns the items when everything validates', () => {
    expect(parseCatalogItemsStrict([validItem()], 'embed')).toHaveLength(1);
  });

  // A pipeline step that quietly processes 95% of the catalog produces a wrong
  // result that looks like a right one.
  it('refuses to continue on a partial catalog', () => {
    expect(() =>
      parseCatalogItemsStrict([validItem(), validItem({ source: 'formdecor' })], 'embed'),
    ).toThrow(/\[embed\] dropped 1 of 2/);
  });

  it('names the remedy in the message', () => {
    expect(() => parseCatalogItemsStrict([validItem({ source: 'formdecor' })], 'db:load')).toThrow(
      /pnpm data:prune/,
    );
  });

  it('throws on a malformed file rather than returning nothing', () => {
    expect(() => parseCatalogItemsStrict('not json', 'merge:omega')).toThrow(/not an array/);
  });
});

describe('rejection keys', () => {
  it('files a non-object record under the root', () => {
    const report = parseCatalogItems(['a string', null, 42]);
    expect(report.dropped).toBe(3);
    expect(report.reasons).toEqual([{ reason: '<root>: invalid_type', count: 3 }]);
  });

  it('names the dotted path of the first failing field', () => {
    const report = parseCatalogItems([
      validItem({ vendor: { ...validItem().vendor, city: 'NYC' } }),
      validItem({ images: ['not a url'] }),
    ]);
    expect(report.reasons).toEqual([
      { reason: 'vendor.city: invalid_literal', count: 1 },
      { reason: 'images.0: invalid_string', count: 1 },
    ]);
  });

  it('treats a non-string source as a type error, not an unknown vendor', () => {
    const report = parseCatalogItems([validItem({ source: 42 })]);
    expect(report.reasons).toEqual([{ reason: 'source: invalid_type', count: 1 }]);
  });

  it('prefers the unknown-source reason even when it is not the first issue', () => {
    const report = parseCatalogItems([validItem({ id: 7, source: 'formdecor' })]);
    expect(report.reasons).toEqual([{ reason: 'unknown source "formdecor"', count: 1 }]);
  });
});

describe('describeRejections for a malformed file', () => {
  it('reports the shape problem without a dropped-of-total clause', () => {
    expect(describeRejections(parseCatalogItems(null), 'catalog')).toBe(
      '[catalog] 1x input is not an array — got object',
    );
    expect(describeRejections(parseCatalogItems('x'), 'catalog')).toBe(
      '[catalog] 1x input is not an array — got string',
    );
  });

  it('joins several reasons with semicolons, most frequent first', () => {
    const summary = describeRejections(
      parseCatalogItems([validItem({ name: 1 }), validItem({ source: 'x' }), validItem({ source: 'x' })]),
      'embed',
    );
    expect(summary).toBe('[embed] dropped 3 of 3 invalid items — 2x unknown source "x"; 1x name: invalid_type');
  });
});

describe('parseCatalogItemsStrict on the empty cases', () => {
  it('accepts an empty array', () => {
    expect(parseCatalogItemsStrict([], 'embed')).toEqual([]);
  });

  it('names the counts it refused to work with', () => {
    expect(() => parseCatalogItemsStrict([validItem(), validItem(), validItem({ name: 1 })], 'load')).toThrow(
      /processes 2 of 3 items/,
    );
  });
});
