import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The catalog Spacelab loads beside a room. publish.test.ts pins the entry
 * shape; this covers which rows make it in: only models with a mesh, for a
 * given room or for the whole shelf.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { db } from '@/test/mocks/supabase-admin';
import { catalogEntriesFor, catalogEntryFor, fullCatalog } from './catalog';
import type { SpacelabModel } from './models';

function row(assetId: string, over: Record<string, unknown> = {}) {
  return {
    asset_id: assetId,
    source: 'ec',
    source_id: assetId.split(':')[2],
    title: `Piece ${assetId}`,
    category: 'seating',
    spacelab_category: 'seating',
    tags: [],
    dims_m: { w: 1, h: 1, d: 1 },
    dims_source: 'vendor',
    image_url: null,
    status: 'ready',
    provider: 'mock',
    external_job_id: null,
    glb_url: `https://cdn.test/${assetId}.glb`,
    error_message: null,
    ...over,
  };
}

beforeEach(() => {
  db.reset();
  db.seed('spacelab_models', [
    row('prophaus:ec:b'),
    row('prophaus:ec:a'),
    row('prophaus:ec:c', { glb_url: null }),
    row('prophaus:ec:d', { status: 'failed', glb_url: null }),
    row('prophaus:ec:e', { status: 'pending' }),
  ]);
});

describe('catalogEntriesFor', () => {
  it('returns entries only for requested assets that have a mesh', async () => {
    const entries = await catalogEntriesFor(['prophaus:ec:a', 'prophaus:ec:c', 'prophaus:ec:d', 'prophaus:ec:e', 'prophaus:ec:ghost']);
    expect(entries.map((e) => e.asset_id)).toEqual(['prophaus:ec:a']);
    expect(entries[0].blob).toBe('https://cdn.test/prophaus:ec:a.glb');
  });

  it('is empty for no ids without touching the database', async () => {
    db.log.length = 0;
    expect(await catalogEntriesFor([])).toEqual([]);
    expect(db.log).toEqual([]);
  });
});

describe('fullCatalog', () => {
  it('lists every ready model with a mesh, ordered by asset id', async () => {
    expect((await fullCatalog()).map((e) => e.asset_id)).toEqual(['prophaus:ec:a', 'prophaus:ec:b']);
  });

  it('applies the row limit before filtering for a mesh', async () => {
    expect((await fullCatalog(1)).map((e) => e.asset_id)).toEqual(['prophaus:ec:a']);
  });

  it('surfaces a read failure', async () => {
    db.failNext('spacelab_models', 'select', 'boom');
    await expect(fullCatalog()).rejects.toThrow('[spacelab] catalog read failed: boom');
  });
});

describe('catalogEntryFor', () => {
  const model: SpacelabModel = {
    assetId: 'prophaus:zzz:1',
    source: 'zzz',
    sourceId: '1',
    title: 'Unknown vendor piece',
    spacelabCategory: 'decor',
    tags: ['x'],
    dims: { w: 1, h: 1, d: 1 },
    dimsSource: 'fallback',
    status: 'ready',
    anchor: 'floor',
  };

  it('falls back to the raw source for a vendor it cannot name, and to an empty blob', () => {
    const entry = catalogEntryFor(model);
    expect(entry.source).toBe('zzz');
    expect(entry.attribution).toBe('Inventory of zzz, via Prop Haus');
    expect(entry.blob).toBe('');
    expect(entry.front).toBe('+Z');
    expect(entry.source_url).toBeNull();
    expect(entry.license).toBeNull();
    expect(entry.style).toBeNull();
  });
});
