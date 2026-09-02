import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET, OPTIONS } from './route';

/**
 * The public catalog: every ready model, or — with a scene id and its token —
 * just the entries one prepared room needs. No session; the token is the gate.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function modelRow(assetId: string, over: Record<string, unknown> = {}) {
  const [, source, sourceId] = assetId.split(':');
  return {
    asset_id: assetId,
    source,
    source_id: sourceId,
    title: `Item ${sourceId}`,
    category: 'seating',
    spacelab_category: 'seating',
    tags: ['seating', 'leather'],
    dims_m: { w: 2.1, h: 0.78, d: 0.9 },
    dims_source: 'vendor',
    image_url: `https://ecprops.com/img/${sourceId}.jpg`,
    status: 'ready',
    provider: 'mock',
    external_job_id: null,
    glb_url: `https://cdn.test/${source}/${sourceId}.glb`,
    error_message: null,
    ...over,
  };
}

function sceneRow(id: string, token: string, assetIds: string[], orgId = ORG_ID) {
  return {
    id,
    org_id: orgId,
    order_id: `order-${id}`,
    token,
    item_count: assetIds.length,
    model_ready_count: assetIds.length,
    scene: {
      version: 1,
      scene: {
        walls: [],
        openings: [],
        furnishings: assetIds.map((asset_id, i) => ({
          id: i + 1,
          asset: { extent: [1, 1, 1], asset_id },
          placement: { position: [0, 0, 0], yaw: 0, anchor: 'Floor' },
          scale: [1, 1, 1],
          stashed: false,
        })),
        floor_material: 'WoodLight',
        wall_material: 'WarmWhite',
        lighting: 'Noon',
        floor_outline: [],
      },
      next_ids: { wall: 0, opening: 0, furnishing: assetIds.length + 1 },
    },
  };
}

const get = (query = '') => GET(getRequest(`/api/spacelab/catalog${query}`));

function headersOf(res: Response) {
  return Object.fromEntries([...res.headers.entries()]);
}

beforeEach(() => {
  db.reset();
});

describe('GET /api/spacelab/catalog (the full shelf)', () => {
  it('lists every ready model with a mesh, by asset id, in Spacelab’s entry shape', async () => {
    db.seed('spacelab_models', [
      modelRow('prophaus:ec:2'),
      modelRow('prophaus:ec:1'),
      modelRow('prophaus:ec:3', { status: 'failed', glb_url: null, error_message: 'photo 404' }),
      modelRow('prophaus:ec:4', { status: 'pending', glb_url: null }),
      modelRow('prophaus:ec:5', { status: 'ready', glb_url: null }),
    ]);

    const res = await get();
    expect(res.status).toBe(200);
    expect(headersOf(res)).toMatchObject({ ...CORS, 'cache-control': 'public, max-age=60, s-maxage=300' });

    const entries = await readJson<Array<Record<string, unknown>>>(res);
    expect(entries.map((e) => e.asset_id)).toEqual(['prophaus:ec:1', 'prophaus:ec:2']);
    expect(entries[0]).toEqual({
      asset_id: 'prophaus:ec:1',
      title: 'Item 1',
      category: 'seating',
      tags: ['seating', 'leather'],
      dims_m: { w: 2.1, h: 0.78, d: 0.9 },
      blob: 'https://cdn.test/ec/1.glb',
      source: 'EC Props',
      source_url: null,
      license: null,
      attribution: 'Inventory of EC Props, via Prop Haus',
      style: null,
      anchor: 'floor',
      front: '+Z',
      verified: false,
    });
  });

  it('answers an empty shelf when nothing has been generated', async () => {
    expect(await readJson(await get())).toEqual([]);
  });

  it('marks wall-hung categories with the wall anchor', async () => {
    db.seed('spacelab_models', [modelRow('prophaus:ec:9', { category: 'artwork-wall', spacelab_category: 'decor' })]);
    const [entry] = await readJson<Array<{ anchor: string }>>(await get());
    expect(entry.anchor).toBe('wall');
  });

  it('surfaces a read failure', async () => {
    db.failNext('spacelab_models', 'select', 'connection reset');
    await expect(get()).rejects.toThrow('[spacelab] catalog read failed: connection reset');
  });
});

describe('GET /api/spacelab/catalog?scene=…&token=… (one room)', () => {
  const TOKEN = 'a'.repeat(32);

  beforeEach(() => {
    db.seed('spacelab_scenes', [sceneRow('scene-1', TOKEN, ['prophaus:ec:1', 'prophaus:ec:2', 'prophaus:ec:1', 'prophaus:ec:404'])]);
    db.seed('spacelab_models', [modelRow('prophaus:ec:1'), modelRow('prophaus:ec:2'), modelRow('prophaus:ec:3')]);
  });

  it('returns only the entries the room refers to, deduplicated, uncacheable', async () => {
    const res = await get(`?scene=scene-1&token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(headersOf(res)).toMatchObject({ ...CORS, 'cache-control': 'private, no-store' });
    const entries = await readJson<Array<{ asset_id: string }>>(res);
    expect(entries.map((e) => e.asset_id).sort()).toEqual(['prophaus:ec:1', 'prophaus:ec:2']);
  });

  it('skips an asset in the room that has no ready mesh', async () => {
    db.seed('spacelab_models', [modelRow('prophaus:ec:404', { status: 'failed', glb_url: null })]);
    const entries = await readJson<Array<{ asset_id: string }>>(await get(`?scene=scene-1&token=${TOKEN}`));
    expect(entries.map((e) => e.asset_id)).not.toContain('prophaus:ec:404');
  });

  it.each([
    ['no token', '?scene=scene-1'],
    ['an empty token', '?scene=scene-1&token='],
    ['a wrong token', `?scene=scene-1&token=${'b'.repeat(32)}`],
    ['a token of the wrong length', `?scene=scene-1&token=${TOKEN}0`],
    ['an unknown scene', `?scene=nope&token=${TOKEN}`],
  ])('404 with %s, without reading any model', async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(headersOf(res)).toMatchObject(CORS);
    expect(db.log.filter((l) => l.table === 'spacelab_models')).toEqual([]);
  });

  it('a token minted for one room does not open another org’s room', async () => {
    db.seed('spacelab_scenes', [sceneRow('scene-2', 'c'.repeat(32), ['prophaus:ec:3'], OTHER_ORG_ID)]);
    expect((await get(`?scene=scene-2&token=${TOKEN}`)).status).toBe(404);
    expect((await get(`?scene=scene-2&token=${'c'.repeat(32)}`)).status).toBe(200);
  });

  it('surfaces a scene read failure', async () => {
    db.failNext('spacelab_scenes', 'select', 'connection reset');
    await expect(get(`?scene=scene-1&token=${TOKEN}`)).rejects.toThrow('[spacelab] scene read failed: connection reset');
  });
});

describe('OPTIONS /api/spacelab/catalog', () => {
  it('answers the preflight with CORS and no body', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(headersOf(res)).toMatchObject(CORS);
    expect(await res.text()).toBe('');
  });
});
