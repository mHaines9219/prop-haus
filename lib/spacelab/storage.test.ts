import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where a GLB ends up. publish.test.ts pins the path and id encoding; this
 * file covers the two stores, the env-driven choice between them, and the
 * near-miss guard in decodeAssetPath. The shared fake has no getPublicUrl,
 * so the admin mock wraps it with a configurable one.
 */

const publicUrl = vi.hoisted(() => ({
  of: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
}));

vi.mock('@/lib/supabase/admin', async () => {
  const { db } = await import('@/test/mocks/supabase-admin');
  return {
    createAdminClient: () => {
      const client = db.client();
      return {
        ...client,
        storage: {
          from: (bucket: string) => ({
            ...client.storage.from(bucket),
            getPublicUrl: (path: string) => ({ data: { publicUrl: publicUrl.of(bucket, path) } }),
          }),
        },
      };
    },
  };
});

import { db } from '@/test/mocks/supabase-admin';
import {
  GLB_CONTENT_TYPE,
  RegeneratedModelStore,
  SupabaseModelStore,
  decodeAssetPath,
  encodeAssetPath,
  getModelStore,
  modelRouteUrl,
  resetModelStore,
} from './storage';

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

beforeEach(() => {
  db.reset();
  resetModelStore();
  publicUrl.of = (bucket, path) => `https://cdn.test/${bucket}/${path}`;
  vi.stubEnv('SPACELAB_ASSET_BUCKET', undefined);
  vi.stubEnv('SUPABASE_SECRET_KEY', undefined);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
  vi.stubEnv('SPACELAB_MODEL_PROVIDER', undefined);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('RegeneratedModelStore', () => {
  it('retains nothing and addresses the model by its route', async () => {
    const store = new RegeneratedModelStore();
    expect(store.persists).toBe(false);
    expect(await store.put('prophaus:ec:1')).toBe(modelRouteUrl('prophaus:ec:1'));
    expect(db.buckets.size).toBe(0);
  });
});

describe('SupabaseModelStore', () => {
  it('uploads the GLB under the vendor path with the glTF content type and returns the public url', async () => {
    const store = new SupabaseModelStore('models');
    expect(store.persists).toBe(true);
    expect(await store.put('prophaus:ec:1042', GLB)).toBe('https://cdn.test/models/prophaus/ec/1042.glb');
    const stored = db.bucket('models').get('prophaus/ec/1042.glb');
    expect(stored?.contentType).toBe(GLB_CONTENT_TYPE);
    expect([...stored!.bytes]).toEqual([...GLB]);
  });

  it('overwrites a previous mesh for the same asset', async () => {
    const store = new SupabaseModelStore('models');
    await store.put('prophaus:ec:1', GLB);
    await store.put('prophaus:ec:1', new Uint8Array([9]));
    expect([...db.bucket('models').get('prophaus/ec/1.glb')!.bytes]).toEqual([9]);
  });

  it('throws when the upload fails', async () => {
    db.failNextStorage('upload', 'bucket missing');
    await expect(new SupabaseModelStore('models').put('prophaus:ec:1', GLB)).rejects.toThrow(
      '[spacelab] GLB upload failed: bucket missing',
    );
  });

  it('throws when the bucket yields no public url', async () => {
    publicUrl.of = () => '';
    await expect(new SupabaseModelStore('models').put('prophaus:ec:1', GLB)).rejects.toThrow(
      '[spacelab] bucket returned no public URL',
    );
  });
});

describe('getModelStore', () => {
  it('regenerates per request with no bucket, quietly for the mock provider', () => {
    expect(getModelStore()).toBeInstanceOf(RegeneratedModelStore);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns when a paid provider would regenerate on every fetch', () => {
    vi.stubEnv('SPACELAB_MODEL_PROVIDER', 'meshy');
    expect(getModelStore()).toBeInstanceOf(RegeneratedModelStore);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SPACELAB_MODEL_PROVIDER=meshy with no SPACELAB_ASSET_BUCKET'));
  });

  it('still regenerates when the bucket is set but no service key is', () => {
    vi.stubEnv('SPACELAB_ASSET_BUCKET', 'models');
    expect(getModelStore()).toBeInstanceOf(RegeneratedModelStore);
  });

  it('persists to the bucket when a bucket and either key are set', () => {
    vi.stubEnv('SPACELAB_ASSET_BUCKET', 'models');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy');
    expect(getModelStore()).toBeInstanceOf(SupabaseModelStore);
    resetModelStore();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret');
    expect(getModelStore()).toBeInstanceOf(SupabaseModelStore);
  });

  it('memoizes until reset', () => {
    const first = getModelStore();
    vi.stubEnv('SPACELAB_ASSET_BUCKET', 'models');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret');
    expect(getModelStore()).toBe(first);
    resetModelStore();
    expect(getModelStore()).toBeInstanceOf(SupabaseModelStore);
  });
});

describe('decodeAssetPath', () => {
  it('refuses a segment that decodes but does not re-encode to itself', () => {
    const canonical = encodeAssetPath('prophaus:ec:1042');
    const nearMiss = canonical.slice(0, -1) + (canonical.endsWith('g') ? 'h' : 'g');
    expect(decodeAssetPath(canonical)).toBe('prophaus:ec:1042');
    expect(decodeAssetPath(nearMiss)).toBeNull();
  });

  it('refuses padding characters and a segment that decodes to nothing', () => {
    expect(decodeAssetPath('cHJvcGhhdXM=')).toBeNull();
    expect(decodeAssetPath('_')).toBeNull();
  });
});
