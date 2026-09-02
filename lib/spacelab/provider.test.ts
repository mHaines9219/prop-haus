import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBoxProvider, getModel3dProvider, renderMockGlb, resetModel3dProvider } from './provider';
import type { ModelStore } from './storage';

/**
 * The provider seam and its mock. The mock must always produce a mesh: a
 * photo that is missing, private, oversize or not JPEG/PNG costs the texture,
 * never the model. The factory picks the mock for anything it does not know.
 */

const PHOTO = 'https://93.184.216.34/photo.jpg';
const DIMS = { w: 1.8, h: 0.8, d: 0.9 };
const req = { assetId: 'prophaus:ec:1', title: 'Sofa', imageUrl: PHOTO, dims: DIMS };

const fetchMock = vi.fn<typeof fetch>();

function photo(bytes: Uint8Array, contentType: string, headers: Record<string, string> = {}) {
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: { 'content-type': contentType, ...headers } });
}

/** The JSON chunk of a GLB — enough to see whether a texture rode along. */
function glbJson(glb: Uint8Array): { images?: unknown[]; nodes: Array<{ name?: string }> } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)));
}

function fakeStore(): ModelStore & { puts: Array<{ assetId: string; glb: Uint8Array }> } {
  const puts: Array<{ assetId: string; glb: Uint8Array }> = [];
  return {
    persists: true,
    puts,
    async put(assetId, glb) {
      puts.push({ assetId, glb });
      return `https://store.test/${assetId}.glb`;
    },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetModel3dProvider();
  vi.stubEnv('SPACELAB_MODEL_PROVIDER', undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('renderMockGlb', () => {
  it('wraps the listing photo onto the box when it is a JPEG or PNG', async () => {
    fetchMock.mockResolvedValueOnce(photo(new Uint8Array([0xff, 0xd8, 1]), 'image/jpeg; charset=binary'));
    const json = glbJson(await renderMockGlb(req));
    expect(json.images).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(PHOTO, expect.objectContaining({ redirect: 'error' }));
  });

  it('builds an untextured box when there is no photo at all', async () => {
    const json = glbJson(await renderMockGlb({ ...req, imageUrl: undefined }));
    expect(json.images).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<[string, () => Response]>([
    ['a non-OK status', () => new Response('', { status: 404, headers: { 'content-type': 'image/png' } })],
    ['a webp', () => photo(new Uint8Array([1]), 'image/webp')],
    ['no content type', () => new Response(new Uint8Array([1]), { status: 200 })],
    ['a declared length over 6 MB', () => photo(new Uint8Array([1]), 'image/png', { 'content-length': String(6 * 1024 * 1024 + 1) })],
    ['a body over 6 MB', () => photo(new Uint8Array(6 * 1024 * 1024 + 1), 'image/png')],
    ['an empty body', () => photo(new Uint8Array(0), 'image/png')],
  ])('drops the texture on %s and still returns a mesh', async (_, response) => {
    fetchMock.mockResolvedValueOnce(response());
    const json = glbJson(await renderMockGlb(req));
    expect(json.images).toBeUndefined();
  });

  it('drops the texture when the fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(glbJson(await renderMockGlb(req)).images).toBeUndefined();
  });

  it('never fetches a photo from a private or non-https host', async () => {
    for (const imageUrl of ['https://10.0.0.8/a.jpg', 'http://93.184.216.34/a.jpg', 'nope']) {
      expect(glbJson(await renderMockGlb({ ...req, imageUrl })).images).toBeUndefined();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is deterministic for the same request', async () => {
    const a = await renderMockGlb({ ...req, imageUrl: undefined });
    const b = await renderMockGlb({ ...req, imageUrl: undefined });
    expect([...a]).toEqual([...b]);
  });
});

describe('MockBoxProvider', () => {
  it('stores the rendered box under the asset id and reports it ready', async () => {
    const store = fakeStore();
    const provider = new MockBoxProvider(store);
    expect(provider.name).toBe('mock');
    expect(await provider.generate({ ...req, imageUrl: undefined })).toEqual({
      status: 'ready',
      glbUrl: 'https://store.test/prophaus:ec:1.glb',
    });
    expect(store.puts).toHaveLength(1);
    expect(store.puts[0].assetId).toBe('prophaus:ec:1');
    expect(glbJson(store.puts[0].glb).nodes[0].name).toBe('Sofa');
  });

  it('propagates a store failure rather than reporting a phantom mesh', async () => {
    const store: ModelStore = { persists: true, put: async () => { throw new Error('bucket down'); } };
    await expect(new MockBoxProvider(store).generate({ ...req, imageUrl: undefined })).rejects.toThrow('bucket down');
  });
});

describe('getModel3dProvider', () => {
  it('defaults to the mock and memoizes it', () => {
    const first = getModel3dProvider();
    expect(first).toBeInstanceOf(MockBoxProvider);
    expect(getModel3dProvider()).toBe(first);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns and uses the mock for a provider it does not know', () => {
    vi.stubEnv('SPACELAB_MODEL_PROVIDER', 'meshy');
    expect(getModel3dProvider()).toBeInstanceOf(MockBoxProvider);
    expect(console.warn).toHaveBeenCalledWith('[spacelab] unknown SPACELAB_MODEL_PROVIDER "meshy" — using mock');
  });

  it('re-reads the env after a reset', () => {
    const first = getModel3dProvider();
    resetModel3dProvider();
    expect(getModel3dProvider()).not.toBe(first);
  });
});
