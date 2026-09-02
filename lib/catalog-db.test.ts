import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '@/test/helpers/fake-supabase';
import { catalogRow, makeCardItem, makePropItem } from '@/test/fixtures/catalog';

/**
 * The Postgres-backed catalog behind every browse surface. The interesting
 * behaviour is at the edges: env that is missing, an offset past the end,
 * PostgREST's numeric-as-string prices, id chunking, and totals that come from
 * the facets view rather than a live count.
 */

const supabase = vi.hoisted(() => ({
  db: null as FakeSupabase | null,
  createCalls: [] as unknown[][],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    supabase.createCalls.push(args);
    return supabase.db!.client();
  },
}));

const db = new FakeSupabase();
supabase.db = db;

async function load(): Promise<typeof import('./catalog-db')> {
  vi.resetModules();
  return import('./catalog-db');
}

const FACETS = {
  categories: { 'storage-credenzas': 40, lighting: 12 },
  vendors: { omega: 30, hpr: 22 },
  total: 52,
};

function row(sourceId: string, over: Parameters<typeof catalogRow>[0] = {}) {
  return catalogRow({ sourceId, ...over });
}

beforeEach(() => {
  db.reset();
  supabase.createCalls.length = 0;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://unit.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk_unit');
  db.rpc('catalog_facets', () => FACETS);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('client', () => {
  it('throws before querying when the URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { browseCards } = await load();
    await expect(browseCards({})).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required/);
    expect(supabase.createCalls).toHaveLength(0);
  });

  it('throws when the publishable key is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    const { catalogFacets } = await load();
    await expect(catalogFacets()).rejects.toThrow(/are required to read the catalog/);
  });

  it('creates one anon client without session persistence and reuses it', async () => {
    const { catalogFacets, relatedCards } = await load();
    await catalogFacets();
    await relatedCards('lighting', 5);
    await catalogFacets();
    expect(supabase.createCalls).toEqual([
      ['https://unit.supabase.co', 'pk_unit', { auth: { persistSession: false } }],
    ]);
  });
});

describe('browseCards', () => {
  beforeEach(() => {
    db.seed('prop_items', [
      row('1'),
      row('2', { category: 'lighting' }),
      row('3', { source: 'hpr', vendor: { id: 'hpr', name: 'Hand Prop Room', city: 'LA', sourceUrl: 'https://www.hpr.com' } }),
      row('4', { images: [] }),
      row('5', { category: 'lighting', source: 'hpr', vendor: { id: 'hpr', name: 'Hand Prop Room', city: 'LA', sourceUrl: 'https://www.hpr.com' } }),
    ]);
  });

  it('returns cards ordered by id, skipping items without images, with the facet total', async () => {
    const { browseCards } = await load();
    const page = await browseCards({});
    expect(page.items.map((i) => i.id)).toEqual(['hpr-3', 'hpr-5', 'omega-1', 'omega-2']);
    expect(page.total).toBe(52);
    expect(page.items[2]).toEqual(makeCardItem({ sourceId: '1' }));
  });

  it('pages with offset and limit', async () => {
    const { browseCards } = await load();
    const page = await browseCards({ offset: 1, limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(['hpr-5', 'omega-1']);
  });

  it('clamps a negative offset to zero and a zero limit to one', async () => {
    const { browseCards } = await load();
    const page = await browseCards({ offset: -5, limit: 0 });
    expect(page.items.map((i) => i.id)).toEqual(['hpr-3']);
  });

  it('caps the limit at 200', async () => {
    db.reset();
    db.rpc('catalog_facets', () => FACETS);
    db.seed(
      'prop_items',
      Array.from({ length: 205 }, (_, i) => row(String(i).padStart(4, '0'))),
    );
    const { browseCards } = await load();
    expect((await browseCards({ limit: 500 })).items).toHaveLength(200);
  });

  it('answers an offset past the end with an empty page and the real total', async () => {
    const { browseCards } = await load();
    expect(await browseCards({ offset: 50 })).toEqual({ items: [], total: 52 });
  });

  it('takes the category total from the facets, not a live count', async () => {
    const { browseCards } = await load();
    const page = await browseCards({ category: 'lighting' });
    expect(page.items.map((i) => i.id)).toEqual(['hpr-5', 'omega-2']);
    expect(page.total).toBe(12);
    expect(db.log.filter((l) => l.table === 'prop_items')).toHaveLength(1);
  });

  it('takes the vendor total from the facets', async () => {
    const { browseCards } = await load();
    const page = await browseCards({ vendor: 'hpr' });
    expect(page.items.map((i) => i.id)).toEqual(['hpr-3', 'hpr-5']);
    expect(page.total).toBe(22);
  });

  it('reports zero for a category or vendor the facets do not know', async () => {
    const { browseCards } = await load();
    expect((await browseCards({ category: 'ghosts' })).total).toBe(0);
    expect((await browseCards({ vendor: 'ghosts' })).total).toBe(0);
  });

  it('counts live only when both filters are set, and never calls the facets then', async () => {
    const { browseCards } = await load();
    const page = await browseCards({ category: 'lighting', vendor: 'hpr' });
    expect(page.items.map((i) => i.id)).toEqual(['hpr-5']);
    expect(page.total).toBe(1);
    expect(db.log.some((l) => l.table === 'rpc:catalog_facets')).toBe(false);
    expect(db.log.filter((l) => l.table === 'prop_items')).toHaveLength(2);
  });

  it('surfaces a browse failure with the upstream message', async () => {
    db.failNext('prop_items', 'select', 'statement timeout');
    const { browseCards } = await load();
    await expect(browseCards({})).rejects.toThrow('[catalog-db] browse failed: statement timeout');
  });

  it('surfaces a count failure when the live count is what broke', async () => {
    db.failNext('prop_items', 'select', 'count timed out');
    const { browseCards } = await load();
    await expect(browseCards({ category: 'lighting', vendor: 'hpr' })).rejects.toThrow(
      '[catalog-db] count failed: count timed out',
    );
  });

  it('surfaces a facets failure', async () => {
    db.failNext('rpc:catalog_facets', undefined, 'view missing');
    const { browseCards } = await load();
    await expect(browseCards({})).rejects.toThrow('[catalog-db] facets failed: view missing');
  });
});

describe('rowToCard', () => {
  it('parses the numeric-string price and defaults the currency', async () => {
    db.seed('prop_items', [
      { ...row('1'), price_amount: '120.50', price_currency: null, price_unit: null },
    ]);
    const { relatedCards } = await load();
    const [card] = await relatedCards('storage-credenzas', 10);
    expect(card.price).toEqual({ amount: 120.5, currency: 'USD', unit: undefined });
  });

  it('leaves price undefined when the amount column is null', async () => {
    db.seed('prop_items', [{ ...row('1'), price_amount: null, price_currency: 'USD', price_unit: 'day' }]);
    const { relatedCards } = await load();
    const [card] = await relatedCards('storage-credenzas', 10);
    expect(card.price).toBeUndefined();
  });

  it('maps null columns to absent fields and keeps only the first image', async () => {
    db.seed('prop_items', [
      {
        ...row('1'),
        subcategory: null,
        plate_mode: null,
        dimensions: null,
        images: ['https://a/1.jpg', 'https://a/2.jpg'],
      },
    ]);
    const { relatedCards } = await load();
    const [card] = await relatedCards('storage-credenzas', 10);
    expect(card.subcategory).toBeUndefined();
    expect(card.plateMode).toBeUndefined();
    expect(card.dimensions).toBeUndefined();
    expect(card.images).toEqual(['https://a/1.jpg']);
  });

  it('stamps inches onto stored dimensions', async () => {
    db.seed('prop_items', [{ ...row('1'), dimensions: { width: 10, height: 20 } }]);
    const { relatedCards } = await load();
    const [card] = await relatedCards('storage-credenzas', 10);
    expect(card.dimensions).toEqual({ width: 10, height: 20, unit: 'in' });
  });
});

describe('getItemBySourceId', () => {
  it('returns the full validated item', async () => {
    db.seed('prop_items', [row('1'), row('2')]);
    const { getItemBySourceId } = await load();
    const item = await getItemBySourceId('omega', '2');
    expect(item).toEqual(makePropItem({ sourceId: '2' }));
  });

  it('is undefined when nothing matches', async () => {
    db.seed('prop_items', [row('1')]);
    const { getItemBySourceId } = await load();
    expect(await getItemBySourceId('omega', '9')).toBeUndefined();
    expect(await getItemBySourceId('hpr', '1')).toBeUndefined();
  });

  it('drops a row that fails validation and warns, rather than throwing', async () => {
    db.seed('prop_items', [{ ...row('1'), source: 'unknown-vendor' }]);
    const { getItemBySourceId } = await load();
    expect(await getItemBySourceId('unknown-vendor', '1')).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[item] dropped 1 of 1'));
  });

  it('fills the optional columns from null with sensible defaults', async () => {
    db.seed('prop_items', [
      {
        ...row('1'),
        description: null,
        subcategory: null,
        source_category_path: null,
        style: null,
        images: null,
        price_amount: null,
        plate_mode: null,
      },
    ]);
    const { getItemBySourceId } = await load();
    const item = await getItemBySourceId('omega', '1');
    expect(item).toBeDefined();
    expect(item!.sourceCategoryPath).toEqual([]);
    expect(item!.images).toEqual([]);
    expect(item!.description).toBeUndefined();
    expect(item!.price).toBeUndefined();
    expect(item!.style).toBeUndefined();
  });

  it('surfaces a read failure', async () => {
    db.failNext('prop_items', 'select', 'boom');
    const { getItemBySourceId } = await load();
    await expect(getItemBySourceId('omega', '1')).rejects.toThrow('[catalog-db] getItem failed: boom');
  });
});

describe('itemsByIds', () => {
  it('returns nothing and runs no query for an empty or all-blank list', async () => {
    const { itemsByIds } = await load();
    expect(await itemsByIds([])).toEqual([]);
    expect(await itemsByIds(['', ''])).toEqual([]);
    expect(db.log).toEqual([]);
  });

  it('dedupes ids and fetches them in one query', async () => {
    db.seed('prop_items', [row('1'), row('2'), row('3')]);
    const { itemsByIds } = await load();
    const items = await itemsByIds(['omega-1', 'omega-1', 'omega-3', '']);
    expect(items.map((i) => i.id).sort()).toEqual(['omega-1', 'omega-3']);
    expect(db.log).toHaveLength(1);
  });

  it('silently omits ids that no longer exist', async () => {
    db.seed('prop_items', [row('1')]);
    const { itemsByIds } = await load();
    expect((await itemsByIds(['omega-1', 'omega-gone'])).map((i) => i.id)).toEqual(['omega-1']);
  });

  it('chunks 100 ids per query and flattens the pages', async () => {
    db.seed('prop_items', [row('0000'), row('0150'), row('0249')]);
    const { itemsByIds } = await load();
    const ids = Array.from({ length: 250 }, (_, i) => `omega-${String(i).padStart(4, '0')}`);
    const items = await itemsByIds(ids);
    expect(db.log).toHaveLength(3);
    expect(items.map((i) => i.id).sort()).toEqual(['omega-0000', 'omega-0150', 'omega-0249']);
  });

  it('surfaces a failed chunk', async () => {
    db.failNext('prop_items', 'select', 'boom');
    const { itemsByIds } = await load();
    await expect(itemsByIds(['omega-1'])).rejects.toThrow('[catalog-db] itemsByIds failed: boom');
  });
});

describe('relatedCards and categoryCards', () => {
  beforeEach(() => {
    db.seed('prop_items', [
      row('1', { category: 'lighting' }),
      row('2', { category: 'lighting', images: [] }),
      row('3', { category: 'lighting' }),
      row('4'),
    ]);
  });

  it('relatedCards returns cards for the category with images, up to the limit, without a total', async () => {
    const { relatedCards } = await load();
    const cards = await relatedCards('lighting', 1);
    expect(cards).toHaveLength(1);
    expect(cards[0].category).toBe('lighting');
    expect(db.log.some((l) => l.table === 'rpc:catalog_facets')).toBe(false);
  });

  it('relatedCards is empty for an unknown category', async () => {
    const { relatedCards } = await load();
    expect(await relatedCards('ghosts', 10)).toEqual([]);
  });

  it('relatedCards surfaces a failure', async () => {
    db.failNext('prop_items', 'select', 'boom');
    const { relatedCards } = await load();
    await expect(relatedCards('lighting', 10)).rejects.toThrow('[catalog-db] related failed: boom');
  });

  it('categoryCards is a browse of that category from the first page', async () => {
    const { categoryCards } = await load();
    const page = await categoryCards('lighting');
    expect(page.items.map((i) => i.id)).toEqual(['omega-1', 'omega-3']);
    expect(page.total).toBe(12);
  });

  it('categoryCards honours a caller limit', async () => {
    const { categoryCards } = await load();
    expect((await categoryCards('lighting', 1)).items).toHaveLength(1);
  });
});

describe('catalogFacets', () => {
  it('reads the precomputed view', async () => {
    const { catalogFacets } = await load();
    expect(await catalogFacets()).toEqual(FACETS);
  });

  it('coerces a string total and defaults missing maps', async () => {
    db.rpc('catalog_facets', () => ({ total: '90210' }));
    const { catalogFacets } = await load();
    expect(await catalogFacets()).toEqual({ categories: {}, vendors: {}, total: 90210 });
  });

  it('reports zero when the view is empty', async () => {
    db.rpc('catalog_facets', () => ({}));
    const { catalogFacets } = await load();
    expect((await catalogFacets()).total).toBe(0);
  });

  it('surfaces an rpc failure', async () => {
    db.failNext('rpc:catalog_facets', undefined, 'no such function');
    const { catalogFacets } = await load();
    await expect(catalogFacets()).rejects.toThrow('[catalog-db] facets failed: no such function');
  });
});
