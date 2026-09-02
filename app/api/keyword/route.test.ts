import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, readJson } from '@/test/helpers/request';
import { makePropItem } from '@/test/fixtures/catalog';
import type { CardItem } from '@/lib/types';

vi.mock('@/lib/catalog', async () => {
  const actual = await import('@/lib/catalog');
  return { ...actual, loadCatalog: vi.fn(async () => []) };
});

import { loadCatalog } from '@/lib/catalog';
import { GET } from './route';

/**
 * Keyword search is public and local: no session, no model, no metering. The
 * route's own job is the query guard, the 60-cap, and the card projection.
 */

type Body = { query: string; matches: Array<{ item: CardItem; matchedVia: string[]; score: number }>; total: number };

function catalog(items = [makePropItem()]) {
  vi.mocked(loadCatalog).mockResolvedValue(items);
}

beforeEach(() => {
  vi.mocked(loadCatalog).mockReset();
  catalog();
});

describe('query guard', () => {
  it.each(['/api/keyword', '/api/keyword?q=', '/api/keyword?q=%20%20'])('%s answers empty without loading the catalog', async (path) => {
    const res = await GET(getRequest(path));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ query: '', matches: [], total: 0 });
    expect(loadCatalog).not.toHaveBeenCalled();
  });

  it('clips the query to 200 characters before searching', async () => {
    const res = await GET(getRequest(`/api/keyword?q=${'credenza '.repeat(40)}`));
    const body = await readJson<Body>(res);
    expect(body.query.length).toBeLessThanOrEqual(200);
    expect(body.query.endsWith(' ')).toBe(false);
    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('trims but otherwise echoes the query', async () => {
    const body = await readJson<Body>(await GET(getRequest('/api/keyword?q=%20Walnut%20Credenza%20')));
    expect(body.query).toBe('Walnut Credenza');
  });
});

describe('results', () => {
  it('returns cards, not full items, with how each matched', async () => {
    const body = await readJson<Body>(await GET(getRequest('/api/keyword?q=walnut')));
    expect(body.total).toBe(1);
    expect(body.matches).toHaveLength(1);
    const [m] = body.matches;
    expect(m.item).toEqual({
      id: 'omega-12345',
      source: 'omega',
      sourceId: '12345',
      name: 'Mid-century walnut credenza',
      subcategory: 'credenzas',
      images: ['https://omegacinemaprops.com/img/12345.jpg'],
      category: 'storage-credenzas',
      sourceUrl: 'https://omegacinemaprops.com/item/12345',
      price: { amount: 120, currency: 'USD', unit: 'week' },
      dimensions: { width: 72, depth: 18, height: 30, unit: 'in' },
      plateMode: 'cutout',
    });
    expect('description' in m.item).toBe(false);
    expect(Array.isArray(m.matchedVia)).toBe(true);
    expect(m.score).toBeGreaterThan(0);
  });

  it('is case-insensitive and requires every token', async () => {
    catalog([
      makePropItem(),
      makePropItem({
        sourceId: '2',
        name: 'Blue velvet sofa',
        description: 'Three-seat sofa.',
        category: 'seating-sofas',
        subcategory: 'sofas',
        sourceCategoryPath: ['Furniture', 'Seating'],
        tags: ['sofa'],
        materials: ['velvet'],
        colors: ['blue'],
      }),
    ]);
    expect((await readJson<Body>(await GET(getRequest('/api/keyword?q=CREDENZA')))).total).toBe(1);
    expect((await readJson<Body>(await GET(getRequest('/api/keyword?q=blue%20credenza')))).total).toBe(0);
    expect((await readJson<Body>(await GET(getRequest('/api/keyword?q=blue%20sofa')))).total).toBe(1);
  });

  it('caps the page at 60 while reporting the full total', async () => {
    catalog(Array.from({ length: 75 }, (_, i) => makePropItem({ sourceId: String(i) })));
    const body = await readJson<Body>(await GET(getRequest('/api/keyword?q=credenza')));
    expect(body.matches).toHaveLength(60);
    expect(body.total).toBe(75);
  });

  it('answers empty for a query that matches nothing', async () => {
    const body = await readJson<Body>(await GET(getRequest('/api/keyword?q=zebra')));
    expect(body).toEqual({ query: 'zebra', matches: [], total: 0 });
  });

  it('sets no CDN cache header (force-dynamic)', async () => {
    const res = await GET(getRequest('/api/keyword?q=walnut'));
    expect(res.headers.get('cache-control')).toBeNull();
  });

  it('surfaces a catalog load failure', async () => {
    vi.mocked(loadCatalog).mockRejectedValue(new Error('disk gone'));
    await expect(GET(getRequest('/api/keyword?q=walnut'))).rejects.toThrow('disk gone');
  });
});
