import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, readJson } from '@/test/helpers/request';
import { makeCardItem } from '@/test/fixtures/catalog';

vi.mock('@/lib/catalog-db', () => ({ browseCards: vi.fn() }));

import { browseCards } from '@/lib/catalog-db';
import { GET } from './route';

/**
 * The browse grid's paging contract: every query-string shape maps to one
 * well-formed call into Postgres, and the response is CDN-cacheable.
 */

const PAGE = { items: [makeCardItem()], total: 1 };

beforeEach(() => {
  vi.mocked(browseCards).mockReset();
  vi.mocked(browseCards).mockResolvedValue(PAGE);
});

it('defaults to the first page of 24 with no filters', async () => {
  const res = await GET(getRequest('/api/browse'));
  expect(res.status).toBe(200);
  expect(browseCards).toHaveBeenCalledWith({ category: null, vendor: null, offset: 0, limit: 24 });
  expect(await readJson(res)).toEqual(PAGE);
});

it('passes category and vendor through untouched', async () => {
  await GET(getRequest('/api/browse?category=seating&vendor=omega'));
  expect(browseCards).toHaveBeenCalledWith({ category: 'seating', vendor: 'omega', offset: 0, limit: 24 });
});

it.each([
  ['offset=48&limit=12', 48, 12],
  ['offset=-5', 0, 24],
  ['offset=abc', 0, 24],
  ['offset=3.9', 3, 24],
  ['offset=1e3', 1, 24],
  ['limit=60', 0, 60],
  ['limit=61', 0, 60],
  ['limit=9999', 0, 60],
  ['limit=-1', 0, 1],
  ['limit=abc', 0, 24],
  ['limit=', 0, 24],
  ['limit=0', 0, 24],
  ['limit=0.5', 0, 24],
  ['offset=&limit=', 0, 24],
])('%s → offset %i, limit %i', async (qs, offset, limit) => {
  await GET(getRequest(`/api/browse?${qs}`));
  expect(browseCards).toHaveBeenCalledWith({ category: null, vendor: null, offset, limit });
});

it('answers with a public CDN cache header', async () => {
  const res = await GET(getRequest('/api/browse'));
  expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600');
});

it('echoes the page exactly, including an empty one', async () => {
  vi.mocked(browseCards).mockResolvedValue({ items: [], total: 0 });
  expect(await readJson(await GET(getRequest('/api/browse?category=nothing')))).toEqual({ items: [], total: 0 });
});

it('surfaces a database failure instead of an empty page', async () => {
  vi.mocked(browseCards).mockRejectedValue(new Error('facet view missing'));
  await expect(GET(getRequest('/api/browse'))).rejects.toThrow('facet view missing');
});

describe('empty category/vendor', () => {
  it('sends an empty string, not null, when the param is present but blank', async () => {
    await GET(getRequest('/api/browse?category=&vendor='));
    expect(browseCards).toHaveBeenCalledWith({ category: '', vendor: '', offset: 0, limit: 24 });
  });
});
