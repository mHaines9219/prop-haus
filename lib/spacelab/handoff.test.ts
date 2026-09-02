import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';
import { makeOrder, makeOrderItem } from '@/test/fixtures/orders';
import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import type { SaveFile } from './scene-format';

/**
 * Order → room. What must hold: one seed per distinct item but one furnishing
 * per line, a rebuild that keeps the token, a token check that is a real
 * check, and a post-checkout hook that never lets a preview failure touch
 * the order.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('@/lib/orders', () => ({ getOrderById: vi.fn() }));
vi.mock('@/lib/catalog-db', () => ({ itemsByIds: vi.fn(async () => []) }));
vi.mock('@/lib/spacelab/models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/spacelab/models')>()),
  ensureModels: vi.fn(async () => new Map()),
}));

import { db } from '@/test/mocks/supabase-admin';
import { getOrderById } from '@/lib/orders';
import { itemsByIds } from '@/lib/catalog-db';
import { ensureModels, type SpacelabModel } from './models';
import {
  assetIdsForScene,
  getSceneByToken,
  getSceneForOrder,
  modelsForScene,
  prepareSceneForOrder,
  queueSpacelabHandoff,
} from './handoff';

const ASSET = 'prophaus:omega:12345';

function model(over: Partial<SpacelabModel> = {}): SpacelabModel {
  return {
    assetId: ASSET,
    source: 'omega',
    sourceId: '12345',
    title: 'Credenza',
    spacelabCategory: 'storage',
    tags: [],
    dims: { w: 1.8, h: 0.8, d: 0.5 },
    dimsSource: 'vendor',
    status: 'ready',
    glbUrl: 'https://cdn.test/x.glb',
    anchor: 'floor',
    ...over,
  };
}

function sceneRow(over: Record<string, unknown> = {}) {
  return {
    id: 'scene-1',
    org_id: ORG_ID,
    order_id: 'order-1',
    token: 'a'.repeat(32),
    scene: { version: 1, scene: { furnishings: [{ asset: { asset_id: ASSET } }, { asset: { asset_id: ASSET } }] }, next_ids: {} },
    item_count: 2,
    model_ready_count: 1,
    updated_at: '2026-09-02T12:00:00.000Z',
    ...over,
  };
}

const scenes = () => db.rows('spacelab_scenes');

beforeEach(() => {
  db.reset();
  vi.mocked(getOrderById).mockReset().mockResolvedValue(makeOrder());
  vi.mocked(itemsByIds).mockReset().mockResolvedValue([]);
  vi.mocked(ensureModels).mockReset().mockResolvedValue(new Map([[ASSET, model()]]));
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', undefined);
  vi.stubEnv('SPACELAB_PREWARM', undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('prepareSceneForOrder', () => {
  it('writes the room with a minted token and returns its addresses', async () => {
    const prepared = await prepareSceneForOrder('order-1', ORG_ID);

    expect(getOrderById).toHaveBeenCalledWith('order-1', ORG_ID);
    const [row] = scenes();
    expect(row).toMatchObject({ org_id: ORG_ID, order_id: 'order-1', item_count: 1, model_ready_count: 1 });
    expect(row.token).toMatch(/^[0-9a-f]{32}$/);
    const scene = row.scene as SaveFile;
    expect(scene.version).toBe(1);
    expect(scene.scene.furnishings).toHaveLength(1);
    expect(scene.scene.furnishings[0].asset).toEqual({ asset_id: ASSET, extent: [1.8, 0.8, 0.5] });

    expect(prepared).toEqual({
      id: row.id,
      itemCount: 1,
      modelReadyCount: 1,
      roomUrl: null,
      roomFileUrl: `http://localhost:3000/api/spacelab/scenes/${row.id}?token=${row.token}&download=1`,
      catalogUrl: `http://localhost:3000/api/spacelab/catalog?scene=${row.id}&token=${row.token}`,
      updatedAt: row.updated_at,
    });
  });

  it('seeds from the catalog row when it exists, else from the order line', async () => {
    vi.mocked(getOrderById).mockResolvedValue(
      makeOrder({ items: [makeOrderItem(), makeOrderItem({ id: 'oi-2', itemId: 'hpr-9', source: 'hpr', sourceId: '9', name: 'Ghost Chair' })] }),
    );
    vi.mocked(itemsByIds).mockResolvedValue([makePropItem()]);

    await prepareSceneForOrder('order-1', ORG_ID);

    expect(itemsByIds).toHaveBeenCalledWith(['omega-12345', 'hpr-9']);
    const seeds = vi.mocked(ensureModels).mock.calls[0][0];
    expect(seeds).toHaveLength(2);
    expect(seeds[0]).toMatchObject({ assetId: ASSET, dimsSource: 'vendor', category: 'storage-credenzas' });
    expect(seeds[1]).toMatchObject({ assetId: 'prophaus:hpr:9', dimsSource: 'fallback', title: 'Ghost Chair' });
  });

  it('seeds each distinct item once but places every line', async () => {
    vi.mocked(getOrderById).mockResolvedValue(makeOrder({ items: [makeOrderItem(), makeOrderItem({ id: 'oi-2' })] }));

    const prepared = await prepareSceneForOrder('order-1', ORG_ID);

    expect(vi.mocked(ensureModels).mock.calls[0][0]).toHaveLength(1);
    expect(prepared.itemCount).toBe(2);
    expect(prepared.modelReadyCount).toBe(2);
    expect((scenes()[0].scene as SaveFile).scene.furnishings).toHaveLength(2);
  });

  it('places a placeholder box for a line whose model is missing, and does not count it ready', async () => {
    vi.mocked(ensureModels).mockResolvedValue(new Map());
    const prepared = await prepareSceneForOrder('order-1', ORG_ID);
    expect(prepared.modelReadyCount).toBe(0);
    expect((scenes()[0].scene as SaveFile).scene.furnishings[0].asset.extent).toEqual([0.6, 0.6, 0.6]);
  });

  it('counts a model ready only when it has a mesh', async () => {
    vi.mocked(ensureModels).mockResolvedValue(new Map([[ASSET, model({ glbUrl: undefined })]]));
    expect((await prepareSceneForOrder('order-1', ORG_ID)).modelReadyCount).toBe(0);
    vi.mocked(ensureModels).mockResolvedValue(new Map([[ASSET, model({ status: 'failed' })]]));
    expect((await prepareSceneForOrder('order-1', ORG_ID)).modelReadyCount).toBe(0);
  });

  it('rebuilds in place, keeping the token a link already carries', async () => {
    const first = await prepareSceneForOrder('order-1', ORG_ID);
    vi.mocked(getOrderById).mockResolvedValue(makeOrder({ items: [makeOrderItem(), makeOrderItem({ id: 'oi-2' })] }));

    const second = await prepareSceneForOrder('order-1', ORG_ID);

    expect(scenes()).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.roomFileUrl).toBe(first.roomFileUrl);
    expect(second.itemCount).toBe(2);
    expect(scenes()[0].item_count).toBe(2);
  });

  it('deep-links into Spacelab once it has a deployment', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPACELAB_URL', 'https://spacelab.app');
    const prepared = await prepareSceneForOrder('order-1', ORG_ID);
    expect(prepared.roomUrl).toMatch(/^https:\/\/spacelab\.app\/\?room=/);
  });

  it('surfaces a write failure', async () => {
    db.failNext('spacelab_scenes', 'insert', 'disk full');
    await expect(prepareSceneForOrder('order-1', ORG_ID)).rejects.toThrow('[spacelab] scene write failed: disk full');
  });

  it('surfaces a duplicate it cannot read back', async () => {
    db.failNext('spacelab_scenes', 'insert', { code: '23505', message: 'duplicate key' });
    await expect(prepareSceneForOrder('order-1', ORG_ID)).rejects.toThrow('[spacelab] scene write failed: duplicate key');
  });

  it('surfaces an update failure on rebuild', async () => {
    await prepareSceneForOrder('order-1', ORG_ID);
    db.failNext('spacelab_scenes', 'update', 'locked');
    await expect(prepareSceneForOrder('order-1', ORG_ID)).rejects.toThrow('[spacelab] scene update failed: locked');
  });

  it('propagates an order that is not this org’s', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new Error('Order not found'));
    await expect(prepareSceneForOrder('order-1', OTHER_ORG_ID)).rejects.toThrow('Order not found');
    expect(scenes()).toHaveLength(0);
  });
});

describe('getSceneForOrder', () => {
  it('is null when no room exists and never generates', async () => {
    expect(await getSceneForOrder('order-1', ORG_ID)).toBeNull();
    expect(ensureModels).not.toHaveBeenCalled();
  });

  it('returns the prepared shape for this org only', async () => {
    db.seed('spacelab_scenes', [sceneRow()]);
    expect(await getSceneForOrder('order-1', ORG_ID)).toMatchObject({ id: 'scene-1', itemCount: 2, modelReadyCount: 1 });
    expect(await getSceneForOrder('order-1', OTHER_ORG_ID)).toBeNull();
  });

  it('throws on a lookup failure', async () => {
    db.failNext('spacelab_scenes', 'select', 'boom');
    await expect(getSceneForOrder('order-1', ORG_ID)).rejects.toThrow('[spacelab] scene lookup failed: boom');
  });
});

describe('getSceneByToken', () => {
  beforeEach(() => db.seed('spacelab_scenes', [sceneRow()]));

  it('returns the room file for the right token', async () => {
    const file = await getSceneByToken('scene-1', 'a'.repeat(32));
    expect(file?.scene.furnishings).toHaveLength(2);
  });

  it('refuses an empty token before reading', async () => {
    expect(await getSceneByToken('scene-1', '')).toBeNull();
    expect(db.log).toEqual([]);
  });

  it('refuses a wrong token of the same or a different length, and an unknown id', async () => {
    expect(await getSceneByToken('scene-1', 'b'.repeat(32))).toBeNull();
    expect(await getSceneByToken('scene-1', 'a'.repeat(31))).toBeNull();
    expect(await getSceneByToken('scene-9', 'a'.repeat(32))).toBeNull();
  });

  it('throws on a read failure', async () => {
    db.failNext('spacelab_scenes', 'select', 'boom');
    await expect(getSceneByToken('scene-1', 'x')).rejects.toThrow('[spacelab] scene read failed: boom');
  });
});

describe('assetIdsForScene and modelsForScene', () => {
  beforeEach(() => db.seed('spacelab_scenes', [sceneRow()]));

  it('lists each asset once', async () => {
    expect(await assetIdsForScene('scene-1', 'a'.repeat(32))).toEqual([ASSET]);
  });

  it('is null for a bad token', async () => {
    expect(await assetIdsForScene('scene-1', 'nope')).toBeNull();
  });

  it('returns the models behind the room, or nothing for a bad token', async () => {
    db.seed('spacelab_models', [
      {
        asset_id: ASSET,
        source: 'omega',
        source_id: '12345',
        title: 'Credenza',
        category: null,
        spacelab_category: 'storage',
        tags: null,
        dims_m: { w: 1, h: 1, d: 1 },
        dims_source: 'vendor',
        image_url: null,
        status: 'ready',
        provider: 'mock',
        external_job_id: null,
        glb_url: 'https://cdn.test/x.glb',
        error_message: null,
      },
    ]);
    const models = await modelsForScene('scene-1', 'a'.repeat(32));
    expect(models.map((m) => m.assetId)).toEqual([ASSET]);
    expect(await modelsForScene('scene-1', 'nope')).toEqual([]);
  });
});

describe('queueSpacelabHandoff', () => {
  it('warms the models and writes the room', async () => {
    await queueSpacelabHandoff(makeOrder(), ORG_ID);
    expect(ensureModels).toHaveBeenCalledTimes(1);
    expect(scenes()).toHaveLength(1);
  });

  it.each(['off', 'OFF', 'Off'])('does nothing when SPACELAB_PREWARM=%s', async (value) => {
    vi.stubEnv('SPACELAB_PREWARM', value);
    await queueSpacelabHandoff(makeOrder(), ORG_ID);
    expect(ensureModels).not.toHaveBeenCalled();
    expect(itemsByIds).not.toHaveBeenCalled();
    expect(scenes()).toHaveLength(0);
  });

  it('swallows a generation failure and logs it', async () => {
    vi.mocked(ensureModels).mockRejectedValue(new Error('provider down'));
    await expect(queueSpacelabHandoff(makeOrder(), ORG_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[spacelab] prewarm failed (order is unaffected)', expect.any(Error));
    expect(scenes()).toHaveLength(0);
  });

  it('swallows a write failure too', async () => {
    db.failNext('spacelab_scenes', 'insert', 'disk full');
    await expect(queueSpacelabHandoff(makeOrder(), ORG_ID)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
