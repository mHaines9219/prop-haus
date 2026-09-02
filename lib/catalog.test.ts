import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';

/**
 * The file-backed catalog is the app's inventory. An unreadable file must read
 * as empty and say so, one bad vendor row must cost that row and not the page,
 * and the parse must happen once per process.
 */

const readFile = vi.hoisted(() => vi.fn<(file: string, encoding?: string) => Promise<string>>());
vi.mock('node:fs', () => ({ promises: { readFile } }));

async function load(): Promise<typeof import('./catalog')> {
  vi.resetModules();
  return import('./catalog');
}

const A = makePropItem({ sourceId: '1', name: 'Credenza', category: 'storage-credenzas' });
const B = makePropItem({
  sourceId: '2',
  name: 'Lamp',
  category: 'lighting',
  images: ['https://x.com/a.jpg', 'https://x.com/b.jpg'],
});
const C = makePropItem({ source: 'hpr', sourceId: '3', name: 'Chair', category: 'lighting' });

function file(entries: unknown) {
  readFile.mockResolvedValue(JSON.stringify(entries));
}

beforeEach(() => {
  readFile.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadCatalog', () => {
  it('reads data/catalog.json under the working directory', async () => {
    file([]);
    const { loadCatalog } = await load();
    await loadCatalog();
    expect(readFile).toHaveBeenCalledWith(path.join(process.cwd(), 'data', 'catalog.json'), 'utf8');
  });

  it('returns [] and logs when the file cannot be read', async () => {
    readFile.mockRejectedValue(new Error('ENOENT: no such file'));
    const { loadCatalog } = await load();
    expect(await loadCatalog()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/\[catalog\] cannot read .*catalog\.json: ENOENT/),
    );
  });

  it('returns [] and logs when the file is not JSON', async () => {
    readFile.mockResolvedValue('{not json');
    const { loadCatalog } = await load();
    expect(await loadCatalog()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[catalog] cannot read'));
  });

  it('keeps the valid rows and warns about the rest', async () => {
    file([A, { ...B, source: 'nope' }, 'garbage']);
    const { loadCatalog } = await load();
    expect(await loadCatalog()).toEqual([A]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[catalog] dropped 2 of 3'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unknown source "nope"'));
  });

  it('treats a non-array file as empty and warns', async () => {
    file({ items: [A] });
    const { loadCatalog } = await load();
    expect(await loadCatalog()).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not an array'));
  });

  it('stays quiet when every row validates', async () => {
    file([A, B]);
    const { loadCatalog } = await load();
    expect(await loadCatalog()).toHaveLength(2);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('reads the file once and serves the cache after', async () => {
    file([A]);
    const { loadCatalog } = await load();
    const first = await loadCatalog();
    const second = await loadCatalog();
    expect(second).toBe(first);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('caches an unreadable file as empty rather than retrying on every call', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    const { loadCatalog } = await load();
    await loadCatalog();
    await loadCatalog();
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe('lookups', () => {
  beforeEach(() => file([A, B, C]));

  it('getByCategory returns only that category, in file order', async () => {
    const { getByCategory } = await load();
    expect((await getByCategory('lighting')).map((i) => i.id)).toEqual([B.id, C.id]);
    expect(await getByCategory('nothing-here')).toEqual([]);
  });

  it('getItem matches on both source and sourceId', async () => {
    const { getItem } = await load();
    expect(await getItem('hpr', '3')).toEqual(C);
    expect(await getItem('omega', '3')).toBeUndefined();
    expect(await getItem('hpr', '1')).toBeUndefined();
  });

  it('categoryCounts tallies every category present', async () => {
    const { categoryCounts } = await load();
    expect(await categoryCounts()).toEqual({ 'storage-credenzas': 1, lighting: 2 });
  });

  it('lookups are empty, not errors, when the catalog is unreadable', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    const { getByCategory, getItem, categoryCounts } = await load();
    expect(await getByCategory('lighting')).toEqual([]);
    expect(await getItem('omega', '1')).toBeUndefined();
    expect(await categoryCounts()).toEqual({});
  });
});

describe('toCardItem', () => {
  it('keeps only the first image and the card fields', async () => {
    const { toCardItem } = await load();
    const card = toCardItem(B);
    expect(card.images).toEqual(['https://x.com/a.jpg']);
    expect(Object.keys(card).sort()).toEqual(
      [
        'id',
        'source',
        'sourceId',
        'name',
        'subcategory',
        'images',
        'category',
        'sourceUrl',
        'price',
        'dimensions',
        'plateMode',
      ].sort(),
    );
    expect(card).not.toHaveProperty('description');
    expect(card).not.toHaveProperty('vendor');
  });

  it('passes optional fields through as undefined rather than inventing them', async () => {
    const { toCardItem } = await load();
    const bare = makePropItem({
      images: [],
      price: undefined,
      dimensions: undefined,
      subcategory: undefined,
      plateMode: undefined,
    });
    const card = toCardItem(bare);
    expect(card.images).toEqual([]);
    expect(card.price).toBeUndefined();
    expect(card.dimensions).toBeUndefined();
    expect(card.subcategory).toBeUndefined();
    expect(card.plateMode).toBeUndefined();
  });
});
