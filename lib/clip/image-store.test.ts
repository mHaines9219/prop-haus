import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Snapshotting a clipped image is best-effort: every failure — private host,
 * bad status, wrong type, oversize, bucket error — must hand back the live
 * URL rather than throw. The shared fake has no getPublicUrl, so the admin
 * mock here wraps it with one.
 */

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
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
          }),
        },
      };
    },
  };
});

import { db } from '@/test/mocks/supabase-admin';
import { PassthroughStore, SupabaseImageStore, getImageStore } from './image-store';

const URL_OK = 'https://93.184.216.34/photo.png';
const fetchMock = vi.fn<typeof fetch>();

function image(bytes: Uint8Array, contentType: string, headers: Record<string, string> = {}) {
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: { 'content-type': contentType, ...headers } });
}

beforeEach(() => {
  db.reset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PassthroughStore', () => {
  it('returns the original url and copies nothing', async () => {
    expect(await new PassthroughStore().put(URL_OK)).toBe(URL_OK);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getImageStore', () => {
  it('is a passthrough without a bucket, or with a bucket but no service key', () => {
    expect(getImageStore()).toBeInstanceOf(PassthroughStore);
    vi.stubEnv('CLIP_IMAGE_BUCKET', 'clips');
    expect(getImageStore()).toBeInstanceOf(PassthroughStore);
  });

  it('copies into the bucket when either service key is present', () => {
    vi.stubEnv('CLIP_IMAGE_BUCKET', 'clips');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret');
    expect(getImageStore()).toBeInstanceOf(SupabaseImageStore);
    vi.stubEnv('SUPABASE_SECRET_KEY', undefined);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy');
    expect(getImageStore()).toBeInstanceOf(SupabaseImageStore);
  });

  it('stays a passthrough when the secret key is present but blank, matching the admin client', () => {
    vi.stubEnv('CLIP_IMAGE_BUCKET', 'clips');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy');
    expect(getImageStore()).toBeInstanceOf(PassthroughStore);
  });
});

describe('SupabaseImageStore.put', () => {
  const store = new SupabaseImageStore('clips');

  it('copies the bytes under the key with the image extension and returns the public url', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    fetchMock.mockResolvedValueOnce(image(bytes, 'image/png'));

    expect(await store.put(URL_OK, 'abc123')).toBe('https://cdn.test/clips/abc123.png');

    const stored = db.bucket('clips').get('abc123.png');
    expect(stored?.contentType).toBe('image/png');
    expect([...stored!.bytes]).toEqual([1, 2, 3, 4]);
    expect(fetchMock).toHaveBeenCalledWith(URL_OK, expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }));
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/jpg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['image/avif', 'avif'],
    ['image/jpeg; charset=binary', 'jpg'],
    ['image/x-unknown', 'img'],
  ])('names a %s object .%s', async (contentType, ext) => {
    fetchMock.mockResolvedValueOnce(image(new Uint8Array([1]), contentType));
    expect(await store.put(URL_OK, 'k')).toBe(`https://cdn.test/clips/k.${ext}`);
    expect(db.bucket('clips').has(`k.${ext}`)).toBe(true);
  });

  it('overwrites an existing object for the same key', async () => {
    fetchMock.mockResolvedValueOnce(image(new Uint8Array([1]), 'image/png'));
    fetchMock.mockResolvedValueOnce(image(new Uint8Array([2]), 'image/png'));
    await store.put(URL_OK, 'k');
    await store.put(URL_OK, 'k');
    expect([...db.bucket('clips').get('k.png')!.bytes]).toEqual([2]);
  });

  it('falls back to the live url when the response is not an image', async () => {
    fetchMock.mockResolvedValueOnce(image(new Uint8Array([1]), 'text/html'));
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
    expect(db.bucket('clips').size).toBe(0);
  });

  it('falls back when there is no content type at all', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
  });

  it('falls back on a non-OK status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('gone', { status: 404, headers: { 'content-type': 'image/png' } }));
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
    expect(db.bucket('clips').size).toBe(0);
  });

  it('falls back when the declared length exceeds 10 MB', async () => {
    fetchMock.mockResolvedValueOnce(
      image(new Uint8Array([1]), 'image/png', { 'content-length': String(10 * 1024 * 1024 + 1) }),
    );
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
    expect(db.bucket('clips').size).toBe(0);
  });

  it('falls back when the body itself exceeds 10 MB', async () => {
    fetchMock.mockResolvedValueOnce(image(new Uint8Array(10 * 1024 * 1024 + 1), 'image/png'));
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
    expect(db.bucket('clips').size).toBe(0);
  });

  it('accepts a body exactly at the cap', async () => {
    fetchMock.mockResolvedValueOnce(image(new Uint8Array(10 * 1024 * 1024), 'image/png'));
    expect(await store.put(URL_OK, 'k')).toBe('https://cdn.test/clips/k.png');
  });

  it('falls back when the bucket refuses the upload', async () => {
    fetchMock.mockResolvedValueOnce(image(new Uint8Array([1]), 'image/png'));
    db.failNextStorage('upload', 'bucket full');
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
  });

  it('falls back when the fetch itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await store.put(URL_OK, 'k')).toBe(URL_OK);
  });

  it('never fetches a private or non-https url', async () => {
    expect(await store.put('https://127.0.0.1/x.png', 'k')).toBe('https://127.0.0.1/x.png');
    expect(await store.put('http://93.184.216.34/x.png', 'k')).toBe('http://93.184.216.34/x.png');
    expect(await store.put('not a url', 'k')).toBe('not a url');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
