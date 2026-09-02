import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { orderItemRow, orderRow } from '@/test/fixtures/orders';
import { makePropItem } from '@/test/fixtures/catalog';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
// The catalog read goes through the anon client, and the mock provider fetches
// photos over the network; both are replaced. Everything downstream — the
// model cache, the room file, the scene row — is real and lands in the fake.
vi.mock('@/lib/catalog-db', () => ({ itemsByIds: vi.fn(async () => []) }));
vi.mock('@/lib/spacelab/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spacelab/provider')>();
  return { ...actual, getModel3dProvider: () => provider };
});

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { itemsByIds } from '@/lib/catalog-db';
import type { ModelRequest, ModelResult } from '@/lib/spacelab/provider';
import { POST } from './route';

/**
 * Preparing a room: the order is looked up under the caller's org, every
 * distinct item gets a cached model, and one scene row per order carries the
 * room file and its bearer token.
 */

const provider = {
  name: 'test-provider',
  generate: vi.fn<(req: ModelRequest) => Promise<ModelResult>>(),
};

const ASSET_ID = 'prophaus:omega:12345';
const post = (body: unknown) => POST(jsonRequest('/api/spacelab/scenes', body));

type Prepared = {
  id: string;
  itemCount: number;
  modelReadyCount: number;
  roomUrl: string | null;
  roomFileUrl: string;
  catalogUrl: string;
  updatedAt: string;
};

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('orders', 'order_items', 'order_id');
  db.unique('spacelab_scenes', ['order_id']);
  db.seed('orders', [orderRow()]);
  db.seed('order_items', [orderItemRow()]);
  provider.generate.mockReset();
  provider.generate.mockImplementation(async (req) => ({ status: 'ready', glbUrl: `https://models.test/${req.assetId}.glb` }));
  vi.mocked(itemsByIds).mockClear();
  vi.mocked(itemsByIds).mockResolvedValue([]);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://prophaus.test');
  vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('refusals', () => {
  it('401 when signed out, before touching the database', async () => {
    signOut();
    const res = await post({ orderId: 'order-1' });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'not signed in' });
    expect(db.log).toEqual([]);
  });

  it('400 for a malformed JSON body', async () => {
    const res = await POST(rawRequest('/api/spacelab/scenes', '{nope'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid JSON body' });
  });

  it.each([[{}], [{ orderId: '' }], [{ orderId: 42 }], [{ orderId: null }], [null], ['order-1']])(
    '400 when the body is %j',
    async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await readJson(res)).toEqual({ error: 'orderId is required' });
      expect(db.log).toEqual([]);
    },
  );

  it('404 for another org’s order, generating and writing nothing', async () => {
    db.seed('orders', [orderRow({ id: 'order-2', org_id: OTHER_ORG_ID })]);
    db.seed('order_items', [orderItemRow({ id: 'oi-2', order_id: 'order-2' })]);
    const res = await post({ orderId: 'order-2' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'could not prepare the room' });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(db.rows('spacelab_scenes')).toHaveLength(0);
    expect(db.rows('spacelab_models')).toHaveLength(0);
  });

  it('404 for an unknown order', async () => {
    expect((await post({ orderId: 'missing' })).status).toBe(404);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('404 with the message when the model write fails', async () => {
    db.failNext('spacelab_models', 'upsert', 'disk full');
    const res = await post({ orderId: 'order-1' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: '[spacelab] model write failed: disk full' });
    expect(db.rows('spacelab_scenes')).toHaveLength(0);
  });
});

describe('preparing a room', () => {
  it('generates the model, writes the scene, and answers with the room’s addresses', async () => {
    const res = await post({ orderId: 'order-1' });
    expect(res.status).toBe(200);
    const body = await readJson<Prepared>(res);

    const [scene] = db.rows('spacelab_scenes');
    expect(scene).toMatchObject({
      id: body.id,
      org_id: ORG_ID,
      order_id: 'order-1',
      item_count: 1,
      model_ready_count: 1,
    });
    expect(scene.token).toMatch(/^[0-9a-f]{32}$/);
    const token = scene.token as string;

    expect(body).toEqual({
      id: scene.id,
      itemCount: 1,
      modelReadyCount: 1,
      roomUrl: null,
      roomFileUrl: `https://prophaus.test/api/spacelab/scenes/${scene.id}?token=${token}&download=1`,
      catalogUrl: `https://prophaus.test/api/spacelab/catalog?scene=${scene.id}&token=${token}`,
      updatedAt: expect.any(String),
    });

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.generate).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      title: 'Mid-century walnut credenza',
      imageUrl: 'https://omegacinemaprops.com/img/12345.jpg',
      dims: { w: 0.61, h: 0.61, d: 0.61 },
    });
    expect(db.rows('spacelab_models')).toEqual([
      expect.objectContaining({
        asset_id: ASSET_ID,
        source: 'omega',
        source_id: '12345',
        title: 'Mid-century walnut credenza',
        category: null,
        spacelab_category: 'decor',
        dims_source: 'fallback',
        image_url: 'https://omegacinemaprops.com/img/12345.jpg',
        status: 'ready',
        provider: 'test-provider',
        glb_url: `https://models.test/${ASSET_ID}.glb`,
        external_job_id: null,
        error_message: null,
      }),
    ]);

    const file = scene.scene as { version: number; scene: { furnishings: Array<{ asset: { asset_id: string; extent: number[] }; stashed: boolean }> }; next_ids: { furnishing: number } };
    expect(file.version).toBe(1);
    expect(file.scene.furnishings).toEqual([
      expect.objectContaining({ asset: { asset_id: ASSET_ID, extent: [0.61, 0.61, 0.61] }, stashed: false }),
    ]);
    expect(file.next_ids.furnishing).toBe(2);
  });

  it('uses the catalog row for size and taxonomy when the item is still listed', async () => {
    vi.mocked(itemsByIds).mockResolvedValue([
      makePropItem({ source: 'omega', sourceId: '12345', category: 'storage-credenzas', dimensions: { width: 72, depth: 18, height: 30, unit: 'in' } }),
    ]);
    await post({ orderId: 'order-1' });
    expect(itemsByIds).toHaveBeenCalledWith(['omega-12345']);
    expect(db.rows('spacelab_models')[0]).toMatchObject({
      category: 'storage-credenzas',
      spacelab_category: 'storage',
      dims_m: { w: 1.829, h: 0.762, d: 0.457 },
      dims_source: 'vendor',
      tags: expect.arrayContaining(['storage-credenzas', 'mid-century', 'walnut']),
    });
  });

  it('deep-links into Spacelab when it has a deployment', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', 'https://spacelab.test/');
    const body = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    const token = db.rows('spacelab_scenes')[0].token as string;
    const room = encodeURIComponent(`https://prophaus.test/api/spacelab/scenes/${body.id}?token=${token}`);
    const catalog = encodeURIComponent(`https://prophaus.test/api/spacelab/catalog?scene=${body.id}&token=${token}`);
    expect(body.roomUrl).toBe(`https://spacelab.test/?room=${room}&catalog=${catalog}`);
  });

  it('re-preparing updates the same row and keeps the token a link already carries', async () => {
    const first = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    const token = db.rows('spacelab_scenes')[0].token;
    db.seed('order_items', [orderItemRow({ id: 'oi-2', item_id: 'omega-777', source_id: '777' })]);

    const second = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    expect(second.id).toBe(first.id);
    expect(second.itemCount).toBe(2);
    expect(db.rows('spacelab_scenes')).toHaveLength(1);
    expect(db.rows('spacelab_scenes')[0].token).toBe(token);
    expect(second.roomFileUrl).toBe(first.roomFileUrl);
  });

  it('reuses a ready model of the same size rather than generating again', async () => {
    await post({ orderId: 'order-1' });
    provider.generate.mockClear();
    const body = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    expect(provider.generate).not.toHaveBeenCalled();
    expect(body.modelReadyCount).toBe(1);
    expect(db.rows('spacelab_models')).toHaveLength(1);
  });

  it('leaves a pending model to the request that owns it', async () => {
    db.seed('spacelab_models', [
      { asset_id: ASSET_ID, source: 'omega', source_id: '12345', title: 'x', category: null, spacelab_category: 'decor', tags: [], dims_m: { w: 0.61, h: 0.61, d: 0.61 }, dims_source: 'fallback', image_url: null, status: 'pending', provider: 'other', external_job_id: 'job-9', glb_url: null, error_message: null },
    ]);
    const body = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    expect(provider.generate).not.toHaveBeenCalled();
    expect(body.modelReadyCount).toBe(0);
    expect(db.rows('spacelab_models')[0]).toMatchObject({ status: 'pending', external_job_id: 'job-9' });
  });

  it('records a generator failure on the model and still writes the room', async () => {
    provider.generate.mockRejectedValue(new Error('photo 404'));
    const res = await post({ orderId: 'order-1' });
    expect(res.status).toBe(200);
    const body = await readJson<Prepared>(res);
    expect(body).toMatchObject({ itemCount: 1, modelReadyCount: 0 });
    expect(db.rows('spacelab_models')).toEqual([
      expect.objectContaining({ asset_id: ASSET_ID, status: 'failed', provider: 'test-provider', error_message: 'photo 404' }),
    ]);
    expect(db.rows('spacelab_scenes')).toEqual([expect.objectContaining({ item_count: 1, model_ready_count: 0 })]);
  });

  it('records a provider that answers failed, and retries it next time', async () => {
    provider.generate.mockResolvedValueOnce({ status: 'failed', error: 'unsupported photo' });
    await post({ orderId: 'order-1' });
    expect(db.rows('spacelab_models')[0]).toMatchObject({ status: 'failed', error_message: 'unsupported photo' });

    const body = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(body.modelReadyCount).toBe(1);
    expect(db.rows('spacelab_models')[0]).toMatchObject({ status: 'ready', error_message: null });
  });

  it('generates one model for two lines of the same item, and stages both', async () => {
    db.seed('order_items', [orderItemRow({ id: 'oi-2' })]);
    const body = await readJson<Prepared>(await post({ orderId: 'order-1' }));
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(db.rows('spacelab_models')).toHaveLength(1);
    expect(body).toMatchObject({ itemCount: 2, modelReadyCount: 2 });
  });
});
