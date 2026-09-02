import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, params, readJson } from '@/test/helpers/request';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET, OPTIONS } from './route';

/** The room file, gated by its bearer token rather than a session. */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const SCENE_ID = '3f9c2a1b-0000-4000-8000-000000000001';
const TOKEN = 'a'.repeat(32);

const ROOM = {
  version: 1,
  scene: {
    walls: [{ id: 0, start: [0, 4], end: [0, 0], thickness: 0.12, height: 2.5, origin: 'Generated' }],
    openings: [],
    furnishings: [
      {
        id: 1,
        asset: { extent: [1, 0.8, 0.6], asset_id: 'prophaus:ec:1' },
        placement: { position: [0.5, 0, 0.8], yaw: 0, anchor: 'Floor' },
        scale: [1, 1, 1],
        stashed: false,
      },
    ],
    floor_material: 'WoodLight',
    wall_material: 'WarmWhite',
    lighting: 'Noon',
    floor_outline: [[0, 0], [5, 0], [5, 4], [0, 4]],
  },
  next_ids: { wall: 1, opening: 0, furnishing: 2 },
};

function seedScene(id = SCENE_ID, token = TOKEN, orgId = ORG_ID) {
  db.seed('spacelab_scenes', [
    { id, org_id: orgId, order_id: `order-${id}`, token, scene: ROOM, item_count: 1, model_ready_count: 1 },
  ]);
}

const get = (query: string, id = SCENE_ID) => GET(getRequest(`/api/spacelab/scenes/${id}${query}`), params({ id }));

function headersOf(res: Response) {
  return Object.fromEntries([...res.headers.entries()]);
}

beforeEach(() => {
  db.reset();
  seedScene();
});

describe('GET /api/spacelab/scenes/[id]', () => {
  it('serves the room file for the right token, uncacheable and cross-origin', async () => {
    const res = await get(`?token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(headersOf(res)).toMatchObject({ ...CORS, 'content-type': 'application/json', 'cache-control': 'private, no-store' });
    expect(res.headers.get('content-disposition')).toBeNull();
    expect(await readJson(res)).toEqual(ROOM);
  });

  it('offers the file as a download named after the room when asked', async () => {
    const res = await get(`?token=${TOKEN}&download=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="prop-haus-room-${SCENE_ID.slice(0, 8)}.json"`);
    expect(await readJson(res)).toEqual(ROOM);
  });

  it('404 without a token, and never reads the row', async () => {
    for (const query of ['', '?token=', '?download=1']) {
      const res = await get(query);
      expect(res.status).toBe(404);
      expect(await readJson(res)).toEqual({ error: 'not found' });
      expect(headersOf(res)).toMatchObject(CORS);
    }
    expect(db.log).toEqual([]);
  });

  it.each([
    ['a wrong token of the right length', `?token=${'b'.repeat(32)}`],
    ['a token that is one character short', `?token=${TOKEN.slice(1)}`],
    ['a token with a suffix', `?token=${TOKEN}0`],
    ['a token in a different case', `?token=${TOKEN.toUpperCase()}`],
  ])('404 for %s', async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
  });

  it('404 for an unknown room even with a valid-looking token', async () => {
    expect((await get(`?token=${TOKEN}`, 'nope')).status).toBe(404);
  });

  it('one room’s token does not open another org’s room', async () => {
    const theirs = '3f9c2a1b-0000-4000-8000-000000000002';
    seedScene(theirs, 'c'.repeat(32), OTHER_ORG_ID);
    expect((await get(`?token=${TOKEN}`, theirs)).status).toBe(404);
    expect((await get(`?token=${'c'.repeat(32)}`, theirs)).status).toBe(200);
  });

  it('surfaces a read failure rather than answering 404', async () => {
    db.failNext('spacelab_scenes', 'select', 'connection reset');
    await expect(get(`?token=${TOKEN}`)).rejects.toThrow('[spacelab] scene read failed: connection reset');
  });
});

describe('OPTIONS /api/spacelab/scenes/[id]', () => {
  it('answers the preflight with CORS and no body', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(headersOf(res)).toMatchObject(CORS);
    expect(await res.text()).toBe('');
  });
});
