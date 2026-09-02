import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';
import { assetIdFor, dimsMetresFor, tagsFor } from './asset';
import type { Model3dProvider, ModelResult } from './provider';

/**
 * The per-item model cache. A mesh costs a paid call, so the reuse rules are
 * the point: ready rows are kept unless the size changed, failed rows are
 * retried, pending rows belong to someone else. Failures land in the row,
 * never in a throw, except when the write itself fails.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

const providerRef = vi.hoisted(() => ({ current: null as Model3dProvider | null }));
vi.mock('@/lib/spacelab/provider', () => ({ getModel3dProvider: () => providerRef.current }));

import { db } from '@/test/mocks/supabase-admin';
import {
  ensureModels,
  getModel,
  getModels,
  listReadyModels,
  seedFromItem,
  seedFromOrderLine,
  type ModelSeed,
} from './models';

const ASSET = 'prophaus:omega:12345';
const ITEM = makePropItem();

function seed(over: Partial<ModelSeed> = {}): ModelSeed {
  return { ...seedFromItem(ITEM), ...over };
}

function row(over: Record<string, unknown> = {}) {
  const s = seedFromItem(ITEM);
  return {
    asset_id: s.assetId,
    source: s.source,
    source_id: s.sourceId,
    title: s.title,
    category: s.category ?? null,
    spacelab_category: s.spacelabCategory,
    tags: s.tags,
    dims_m: s.dims,
    dims_source: s.dimsSource,
    image_url: s.imageUrl ?? null,
    status: 'ready',
    provider: 'mock',
    external_job_id: null,
    glb_url: 'https://cdn.test/x.glb',
    error_message: null,
    ...over,
  };
}

function provider(result: ModelResult | Error | string = { status: 'ready', glbUrl: 'https://cdn.test/new.glb' }) {
  const generate = vi.fn<Model3dProvider['generate']>(async () => {
    if (result instanceof Error) throw result;
    if (typeof result === 'string') throw result;
    return result;
  });
  providerRef.current = { name: 'fake', generate };
  return generate;
}

beforeEach(() => {
  db.reset();
  provider();
});

describe('seeds', () => {
  it('derives the seed from a catalog item in Spacelab vocabulary', () => {
    expect(seedFromItem(ITEM)).toEqual({
      assetId: ASSET,
      source: 'omega',
      sourceId: '12345',
      title: 'Mid-century walnut credenza',
      category: 'storage-credenzas',
      spacelabCategory: 'storage',
      tags: tagsFor(ITEM),
      dims: dimsMetresFor(ITEM),
      dimsSource: 'vendor',
      imageUrl: 'https://omegacinemaprops.com/img/12345.jpg',
    });
  });

  it('marks fallback dims and omits the image when the item lacks them', () => {
    const s = seedFromItem(makePropItem({ dimensions: undefined, images: [] }));
    expect(s.dimsSource).toBe('fallback');
    expect(s).not.toHaveProperty('imageUrl');
  });

  it('seeds a de-listed line from its checkout snapshot', () => {
    const s = seedFromOrderLine({ source: 'hpr', sourceId: 'a/b', name: 'Ghost Chair', image: 'https://x/1.jpg' });
    expect(s).toEqual({
      assetId: assetIdFor('hpr', 'a/b'),
      source: 'hpr',
      sourceId: 'a/b',
      title: 'Ghost Chair',
      spacelabCategory: 'decor',
      tags: [],
      dims: dimsMetresFor({}),
      dimsSource: 'fallback',
      imageUrl: 'https://x/1.jpg',
    });
    expect(seedFromOrderLine({ source: 'hpr', sourceId: '1', name: 'X' })).not.toHaveProperty('imageUrl');
  });
});

describe('reads', () => {
  it('getModels returns nothing and runs no query for an empty list', async () => {
    expect(await getModels([])).toEqual(new Map());
    expect(db.log).toEqual([]);
  });

  it('getModels dedupes ids and maps rows onto models', async () => {
    db.seed('spacelab_models', [row()]);
    const models = await getModels([ASSET, ASSET, 'prophaus:none:1']);
    expect(db.log).toHaveLength(1);
    expect([...models.keys()]).toEqual([ASSET]);
    expect(models.get(ASSET)).toEqual({
      assetId: ASSET,
      source: 'omega',
      sourceId: '12345',
      title: 'Mid-century walnut credenza',
      category: 'storage-credenzas',
      spacelabCategory: 'storage',
      tags: tagsFor(ITEM),
      dims: dimsMetresFor(ITEM),
      dimsSource: 'vendor',
      imageUrl: 'https://omegacinemaprops.com/img/12345.jpg',
      status: 'ready',
      provider: 'mock',
      glbUrl: 'https://cdn.test/x.glb',
      anchor: 'floor',
    });
  });

  it('leaves optional fields absent for null columns and anchors wall categories', async () => {
    db.seed('spacelab_models', [
      row({
        category: 'artwork-wall',
        tags: null,
        image_url: null,
        status: null,
        provider: null,
        glb_url: null,
        dims_source: 'guess',
        external_job_id: 'job-9',
        error_message: 'photo 404',
      }),
    ]);
    const model = (await getModel(ASSET))!;
    expect(model.tags).toEqual([]);
    expect(model.status).toBe('pending');
    expect(model.dimsSource).toBe('fallback');
    expect(model.anchor).toBe('wall');
    expect(model.externalJobId).toBe('job-9');
    expect(model.errorMessage).toBe('photo 404');
    expect(model).not.toHaveProperty('imageUrl');
    expect(model).not.toHaveProperty('provider');
    expect(model).not.toHaveProperty('glbUrl');
  });

  it('getModel is null for an unknown asset', async () => {
    expect(await getModel('prophaus:none:1')).toBeNull();
  });

  it('getModels throws on a read failure', async () => {
    db.failNext('spacelab_models', 'select', 'boom');
    await expect(getModels([ASSET])).rejects.toThrow('[spacelab] model lookup failed: boom');
  });

  it('listReadyModels returns only ready rows, ordered by asset id, up to the limit', async () => {
    db.seed('spacelab_models', [
      row({ asset_id: 'prophaus:ec:b', status: 'ready' }),
      row({ asset_id: 'prophaus:ec:a', status: 'ready' }),
      row({ asset_id: 'prophaus:ec:c', status: 'failed' }),
      row({ asset_id: 'prophaus:ec:d', status: 'pending' }),
    ]);
    expect((await listReadyModels()).map((m) => m.assetId)).toEqual(['prophaus:ec:a', 'prophaus:ec:b']);
    expect(await listReadyModels(1)).toHaveLength(1);
  });

  it('listReadyModels throws on a read failure', async () => {
    db.failNext('spacelab_models', 'select', 'boom');
    await expect(listReadyModels()).rejects.toThrow('[spacelab] catalog read failed: boom');
  });
});

describe('ensureModels reuse rules', () => {
  it('returns an empty map and runs nothing for no seeds', async () => {
    expect(await ensureModels([])).toEqual(new Map());
    expect(db.log).toEqual([]);
  });

  it('reuses a ready row whose dims still match', async () => {
    db.seed('spacelab_models', [row()]);
    const generate = provider();
    const models = await ensureModels([seed()]);
    expect(generate).not.toHaveBeenCalled();
    expect(models.get(ASSET)?.glbUrl).toBe('https://cdn.test/x.glb');
  });

  it('regenerates when the vendor size changed', async () => {
    db.seed('spacelab_models', [row({ dims_m: { w: 1, h: 1, d: 1 } })]);
    const generate = provider();
    const models = await ensureModels([seed()]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(models.get(ASSET)?.glbUrl).toBe('https://cdn.test/new.glb');
  });

  it('regenerates a ready row that has no mesh', async () => {
    db.seed('spacelab_models', [row({ glb_url: null })]);
    const generate = provider();
    await ensureModels([seed()]);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries a failed row', async () => {
    db.seed('spacelab_models', [row({ status: 'failed', glb_url: null, error_message: 'photo 404' })]);
    const generate = provider();
    const models = await ensureModels([seed()]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(models.get(ASSET)).toMatchObject({ status: 'ready', glbUrl: 'https://cdn.test/new.glb' });
    expect(models.get(ASSET)).not.toHaveProperty('errorMessage');
  });

  it('leaves a pending row to the request that owns it', async () => {
    db.seed('spacelab_models', [row({ status: 'pending', glb_url: null })]);
    const generate = provider();
    const models = await ensureModels([seed()]);
    expect(generate).not.toHaveBeenCalled();
    expect(models.get(ASSET)?.status).toBe('pending');
  });

  it('regenerates everything under force', async () => {
    db.seed('spacelab_models', [row()]);
    const generate = provider();
    await ensureModels([seed()], { force: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('generates only the seeds that need it and merges with the rest', async () => {
    db.seed('spacelab_models', [row()]);
    const generate = provider();
    const fresh = seed({ assetId: 'prophaus:hpr:2', source: 'hpr', sourceId: '2' });
    const models = await ensureModels([seed(), fresh]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect([...models.keys()].sort()).toEqual([ASSET, 'prophaus:hpr:2'].sort());
    expect(db.rows('spacelab_models')).toHaveLength(2);
  });
});

describe('generation outcomes', () => {
  it('claims the row as pending, then records the mesh with the provider name', async () => {
    let statusDuringGenerate: unknown;
    const generate = vi.fn(async () => {
      statusDuringGenerate = db.rows('spacelab_models')[0]?.status;
      return { status: 'ready', glbUrl: 'https://cdn.test/new.glb', externalJobId: 'job-1' } as ModelResult;
    });
    providerRef.current = { name: 'fake', generate };

    const models = await ensureModels([seed()]);

    expect(statusDuringGenerate).toBe('pending');
    expect(generate).toHaveBeenCalledWith({
      assetId: ASSET,
      title: 'Mid-century walnut credenza',
      imageUrl: 'https://omegacinemaprops.com/img/12345.jpg',
      dims: dimsMetresFor(ITEM),
    });
    expect(db.rows('spacelab_models')).toHaveLength(1);
    expect(db.rows('spacelab_models')[0]).toMatchObject({
      asset_id: ASSET,
      status: 'ready',
      provider: 'fake',
      glb_url: 'https://cdn.test/new.glb',
      external_job_id: 'job-1',
      error_message: null,
      dims_source: 'vendor',
    });
    expect(models.get(ASSET)).toMatchObject({ status: 'ready', provider: 'fake', externalJobId: 'job-1' });
  });

  it('omits the image from the request when the seed has none', async () => {
    const generate = provider();
    await ensureModels([seed({ imageUrl: undefined })]);
    expect(generate.mock.calls[0][0]).not.toHaveProperty('imageUrl');
    expect(db.rows('spacelab_models')[0].image_url).toBeNull();
  });

  it('keeps an async job pending with its external id', async () => {
    provider({ status: 'pending', externalJobId: 'job-7' });
    const models = await ensureModels([seed()]);
    expect(models.get(ASSET)).toMatchObject({ status: 'pending', externalJobId: 'job-7' });
    expect(models.get(ASSET)).not.toHaveProperty('glbUrl');
  });

  it('records a provider failure on the row', async () => {
    provider({ status: 'failed', error: 'no mesh for that photo' });
    const models = await ensureModels([seed()]);
    expect(models.get(ASSET)).toMatchObject({ status: 'failed', errorMessage: 'no mesh for that photo' });
  });

  it('records a thrown error on the row instead of throwing', async () => {
    provider(new Error('service 503'));
    const models = await ensureModels([seed()]);
    expect(models.get(ASSET)).toMatchObject({ status: 'failed', errorMessage: 'service 503' });
  });

  it('names an unknown throw', async () => {
    provider('not an error object');
    const models = await ensureModels([seed()]);
    expect(models.get(ASSET)?.errorMessage).toBe('unknown generator error');
  });

  it('throws when the row cannot be written', async () => {
    db.failNext('spacelab_models', 'upsert', 'disk full');
    await expect(ensureModels([seed()])).rejects.toThrow('[spacelab] model write failed: disk full');
  });
});
