import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, params, readJson } from '@/test/helpers/request';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
// The mock renderer fetches the listing photo for its texture; replace it so
// no bytes leave the process and the body is known.
vi.mock('@/lib/spacelab/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spacelab/provider')>();
  return { ...actual, renderMockGlb: vi.fn(async () => GLB) };
});

import { db } from '@/test/mocks/supabase-admin';
import { renderMockGlb } from '@/lib/spacelab/provider';
import { GLB_CONTENT_TYPE, encodeAssetPath } from '@/lib/spacelab/storage';
import { GET, OPTIONS } from './route';

/** The regenerating model route: a base64url asset id in, GLB bytes out. */

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const ASSET_ID = 'prophaus:hpr:chairs%2Fwing back';

function modelRow(over: Record<string, unknown> = {}) {
  return {
    asset_id: ASSET_ID,
    source: 'hpr',
    source_id: 'chairs/wing back',
    title: 'Wingback chair',
    category: 'seating',
    spacelab_category: 'seating',
    tags: ['seating'],
    dims_m: { w: 0.9, h: 1.1, d: 0.9 },
    dims_source: 'vendor',
    image_url: 'https://www.hpr.com/img/wing.jpg',
    status: 'ready',
    provider: 'mock',
    external_job_id: null,
    glb_url: 'http://localhost:3000/api/spacelab/models/x.glb',
    error_message: null,
    ...over,
  };
}

const get = (asset: string) => GET(getRequest(`/api/spacelab/models/${asset}`), params({ asset }));

function headersOf(res: Response) {
  return Object.fromEntries([...res.headers.entries()]);
}

beforeEach(() => {
  db.reset();
  vi.mocked(renderMockGlb).mockClear();
});

describe('GET /api/spacelab/models/[asset]', () => {
  it('serves the mesh with the GLB content type and cache headers', async () => {
    db.seed('spacelab_models', [modelRow()]);
    const res = await get(`${encodeAssetPath(ASSET_ID)}.glb`);
    expect(res.status).toBe(200);
    expect(headersOf(res)).toMatchObject({
      ...CORS,
      'content-type': GLB_CONTENT_TYPE,
      'content-length': String(GLB.byteLength),
      'cache-control': 'public, max-age=60, s-maxage=3600',
    });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(GLB);
    expect(renderMockGlb).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      title: 'Wingback chair',
      imageUrl: 'https://www.hpr.com/img/wing.jpg',
      dims: { w: 0.9, h: 1.1, d: 0.9 },
    });
  });

  it('accepts the segment without an extension, or with an upper-case one', async () => {
    db.seed('spacelab_models', [modelRow()]);
    expect((await get(encodeAssetPath(ASSET_ID))).status).toBe(200);
    expect((await get(`${encodeAssetPath(ASSET_ID)}.GLB`)).status).toBe(200);
  });

  it('renders a model whose listing had no photo without an imageUrl', async () => {
    db.seed('spacelab_models', [modelRow({ image_url: null })]);
    await get(`${encodeAssetPath(ASSET_ID)}.glb`);
    expect(renderMockGlb).toHaveBeenCalledWith({ assetId: ASSET_ID, title: 'Wingback chair', dims: { w: 0.9, h: 1.1, d: 0.9 } });
  });

  it('serves a failed row too — the bytes come from dims and photo, not from the status', async () => {
    db.seed('spacelab_models', [modelRow({ status: 'failed', glb_url: null })]);
    expect((await get(`${encodeAssetPath(ASSET_ID)}.glb`)).status).toBe(200);
  });

  it.each([
    ['a segment that is not base64url', 'not%20base64!.glb'],
    ['a mangled segment that does not round-trip', `${encodeAssetPath(ASSET_ID)}x.glb`],
    ['an empty segment', '.glb'],
  ])('404 for %s, without a database read', async (_label, asset) => {
    db.seed('spacelab_models', [modelRow()]);
    const res = await get(asset);
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(headersOf(res)).toMatchObject(CORS);
    expect(db.log).toEqual([]);
    expect(renderMockGlb).not.toHaveBeenCalled();
  });

  it('404 for an asset with no row', async () => {
    const res = await get(`${encodeAssetPath('prophaus:ec:missing')}.glb`);
    expect(res.status).toBe(404);
    expect(renderMockGlb).not.toHaveBeenCalled();
  });

  it('surfaces a read failure', async () => {
    db.failNext('spacelab_models', 'select', 'connection reset');
    await expect(get(`${encodeAssetPath(ASSET_ID)}.glb`)).rejects.toThrow('[spacelab] model lookup failed: connection reset');
  });
});

describe('OPTIONS /api/spacelab/models/[asset]', () => {
  it('answers the preflight with CORS and no body', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(headersOf(res)).toMatchObject(CORS);
  });
});
