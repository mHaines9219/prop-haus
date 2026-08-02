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
