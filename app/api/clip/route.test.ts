import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
// The fake's storage has no getPublicUrl, which SupabaseImageStore needs after
// an upload; add one that mints a predictable public URL.
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
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake.public/${bucket}/${path}` } }),
          }),
        },
      };
    },
  };
});
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
// The page fetch and the DNS-backed SSRF guard are the network seams; the
// parser and canonicalizer stay real.
vi.mock('@/lib/clip/safe-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/clip/safe-fetch')>();
  return {
    ...actual,
    safeFetchHtml: vi.fn(),
    assertPublicUrl: vi.fn(async (raw: string) => new URL(raw)),
  };
});

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { SafeFetchError, assertPublicUrl, safeFetchHtml } from '@/lib/clip/safe-fetch';
import { POST } from './route';

/**
 * The web clipper: paste a link, get back a ready-to-save folder item. The
 * interesting edges are the refusals (no session, bad URL, blocked host), the
 * "unreadable but here is a draft" 422, image snapshotting, and the per-org
 * rate limit.
 */

const URL_IN = 'https://www.example-shop.com/lamp?utm_source=x&fbclid=y&color=brass#top';
const CANONICAL = 'https://www.example-shop.com/lamp?color=brass';
const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

const PRODUCT_HTML = `<html><head>
<script type="application/ld+json">${JSON.stringify({
  '@type': 'Product',
  name: 'Brass arc lamp',
  description: 'A tall brass lamp.',
  image: 'https://cdn.example-shop.com/lamp.jpg',
  offers: { '@type': 'Offer', price: '249.99', priceCurrency: 'USD' },
})}</script>
<title>Fallback title</title></head><body></body></html>`;

const clip = (body: unknown) => POST(jsonRequest('/api/clip', body));

let clock = Date.UTC(2026, 8, 1);
const fetchMock = vi.fn<typeof fetch>();

function imageResponse(type = 'image/jpeg', bytes = new Uint8Array([0xff, 0xd8, 0xff])) {
  return new Response(bytes, { status: 200, headers: { 'content-type': type } });
}

beforeEach(() => {
  db.reset();
  signIn();
  // Every test gets its own rate-limit window.
  clock += 11 * 60 * 1000;
  vi.spyOn(Date, 'now').mockReturnValue(clock);
  vi.mocked(safeFetchHtml).mockReset();
  vi.mocked(safeFetchHtml).mockResolvedValue({ finalUrl: URL_IN, html: PRODUCT_HTML });
  vi.mocked(assertPublicUrl).mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(imageResponse());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('refusals', () => {
  it('401 when signed out, before fetching or touching the database', async () => {
    signOut();
    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'not signed in' });
    expect(safeFetchHtml).not.toHaveBeenCalled();
    expect(db.log).toEqual([]);
  });

  it('400 invalid for a malformed JSON body', async () => {
    const res = await POST(rawRequest('/api/clip', '{nope'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid' });
    expect(safeFetchHtml).not.toHaveBeenCalled();
  });

  it.each([
    ['no url', {}],
    ['non-string url', { url: 42 }],
    ['empty url', { url: '' }],
    ['whitespace url', { url: '   ' }],
    ['a relative path', { url: '/lamp' }],
    ['a protocol-relative url', { url: '//example-shop.com/lamp' }],
    ['a javascript: url', { url: 'javascript:alert(1)' }],
    ['a data: url', { url: 'data:text/html,hi' }],
    ['an ftp: url', { url: 'ftp://example-shop.com/lamp' }],
  ])('400 invalid for %s, without fetching', async (_label, body) => {
    const res = await clip(body);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid' });
    expect(safeFetchHtml).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', 'only https URLs can be clipped'],
    ['blocked', 'host resolves to a non-public address'],
  ] as const)('400 %s when the guard refuses to reach the host — no draft offered', async (reason, message) => {
    vi.mocked(safeFetchHtml).mockRejectedValue(new SafeFetchError(reason, message));
    const res = await clip({ url: 'https://10.0.0.5/admin' });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: reason });
  });

  it.each(['http', 'timeout', 'too-large', 'too-many-redirects'] as const)(
    '422 unreadable with a draft when the page cannot be read (%s)',
    async (reason) => {
      vi.mocked(safeFetchHtml).mockRejectedValue(new SafeFetchError(reason, 'nope'));
      const res = await clip({ url: URL_IN });
      expect(res.status).toBe(422);
      expect(await readJson(res)).toEqual({
        error: 'unreadable',
        draft: {
          itemId: `clip:${sha1(CANONICAL)}`,
          source: 'clip',
          sourceId: CANONICAL,
          sourceUrl: CANONICAL,
          retailer: 'example-shop.com',
        },
      });
    },
  );

  it('422 unreadable with a draft when the page has no usable name', async () => {
    vi.mocked(safeFetchHtml).mockResolvedValue({ finalUrl: URL_IN, html: '<html><body><div id="app"></div></body></html>' });
    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(422);
    expect(await readJson(res)).toMatchObject({ error: 'unreadable', draft: { sourceId: CANONICAL } });
  });

  it('rethrows an error that is not a SafeFetchError', async () => {
    vi.mocked(safeFetchHtml).mockRejectedValue(new TypeError('boom'));
    await expect(clip({ url: URL_IN })).rejects.toThrow('boom');
  });
});

describe('a readable listing', () => {
  it('returns a folder item keyed by the canonical URL, with the live image when no bucket is configured', async () => {
    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      item: {
        itemId: `clip:${sha1(CANONICAL)}`,
        source: 'clip',
        sourceId: CANONICAL,
        name: 'Brass arc lamp',
        image: 'https://cdn.example-shop.com/lamp.jpg',
        sourceUrl: CANONICAL,
        meta: { retailer: 'example-shop.com', price: { amount: 249.99, currency: 'USD' }, description: 'A tall brass lamp.' },
      },
    });
    expect(safeFetchHtml).toHaveBeenCalledWith(URL_IN.trim());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.buckets.size).toBe(0);
  });

  it('trims the pasted URL before fetching', async () => {
    await clip({ url: `  ${URL_IN}  ` });
    expect(safeFetchHtml).toHaveBeenCalledWith(URL_IN);
  });

  it('identifies the clip by the post-redirect URL, not the one pasted', async () => {
    vi.mocked(safeFetchHtml).mockResolvedValue({ finalUrl: 'https://Example-Shop.com/p/lamp-2?gclid=1', html: PRODUCT_HTML });
    const { item } = await readJson<{ item: { itemId: string; sourceId: string; sourceUrl: string } }>(await clip({ url: URL_IN }));
    expect(item.sourceId).toBe('https://example-shop.com/p/lamp-2');
    expect(item.sourceUrl).toBe('https://example-shop.com/p/lamp-2');
    expect(item.itemId).toBe(`clip:${sha1('https://example-shop.com/p/lamp-2')}`);
  });

  it('omits an image that is not a safe http(s) URL', async () => {
    vi.mocked(safeFetchHtml).mockResolvedValue({
      finalUrl: URL_IN,
      html: '<html><head><meta property="og:title" content="Lamp"><meta property="og:image" content="javascript:alert(1)"></head></html>',
    });
    const { item } = await readJson<{ item: Record<string, unknown> }>(await clip({ url: URL_IN }));
    expect(item).not.toHaveProperty('image');
    expect(item).toMatchObject({ name: 'Lamp', meta: { retailer: 'example-shop.com' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies the retailer rule: Wayfair gets its name and a full-res image', async () => {
    vi.mocked(safeFetchHtml).mockResolvedValue({
      finalUrl: 'https://www.wayfair.com/lighting/pdp/arc-lamp-w1.html',
      html: '<html><head><meta property="og:title" content="Arc Lamp"><meta property="og:image" content="https://assets.wfcdn.com/im/1/resize-h800-w800/lamp.jpg?resize=1"></head></html>',
    });
    const { item } = await readJson<{ item: { image: string; meta: { retailer: string } } }>(await clip({ url: 'https://www.wayfair.com/lighting/pdp/arc-lamp-w1.html' }));
    expect(item.image).toBe('https://assets.wfcdn.com/im/1/resize-h800-w800/lamp.jpg');
    expect(item.meta.retailer).toBe('Wayfair');
  });

  it('clamps an absurdly long name so the item still validates', async () => {
    vi.mocked(safeFetchHtml).mockResolvedValue({
      finalUrl: URL_IN,
      html: `<html><head><title>${'L'.repeat(1000)}</title></head></html>`,
    });
    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(200);
    const { item } = await readJson<{ item: { name: string } }>(res);
    expect(item.name).toHaveLength(300);
  });
});

describe('image snapshot with a bucket configured', () => {
  beforeEach(() => {
    vi.stubEnv('CLIP_IMAGE_BUCKET', 'clips');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-key');
  });

  it('copies the image into the bucket and points the item at the public copy', async () => {
    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(200);
    const { item } = await readJson<{ item: { image: string } }>(res);

    const key = `${sha1(CANONICAL)}.jpg`;
    expect(item.image).toBe(`https://fake.public/clips/${key}`);
    expect(assertPublicUrl).toHaveBeenCalledWith('https://cdn.example-shop.com/lamp.jpg');
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example-shop.com/lamp.jpg', expect.objectContaining({ redirect: 'error' }));
    expect(db.bucket('clips').get(key)).toEqual({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' });
  });

  it('names the object after the content type it received', async () => {
    fetchMock.mockResolvedValue(imageResponse('image/webp'));
    await clip({ url: URL_IN });
    expect([...db.bucket('clips').keys()]).toEqual([`${sha1(CANONICAL)}.webp`]);
  });

  it('falls back to the live URL when the image fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(200);
    const { item } = await readJson<{ item: { image: string } }>(res);
    expect(item.image).toBe('https://cdn.example-shop.com/lamp.jpg');
    expect(db.bucket('clips').size).toBe(0);
  });

  it('falls back when the response is not an image', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const { item } = await readJson<{ item: { image: string } }>(await clip({ url: URL_IN }));
    expect(item.image).toBe('https://cdn.example-shop.com/lamp.jpg');
    expect(db.bucket('clips').size).toBe(0);
  });

  it('falls back when the image host is blocked by the SSRF guard', async () => {
    vi.mocked(assertPublicUrl).mockRejectedValueOnce(new SafeFetchError('blocked', 'private'));
    const { item } = await readJson<{ item: { image: string } }>(await clip({ url: URL_IN }));
    expect(item.image).toBe('https://cdn.example-shop.com/lamp.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back when the upload is refused', async () => {
    db.failNextStorage('upload', 'quota');
    const { item } = await readJson<{ item: { image: string } }>(await clip({ url: URL_IN }));
    expect(item.image).toBe('https://cdn.example-shop.com/lamp.jpg');
  });
});

describe('rate limit', () => {
  it('429 on the 31st clip in ten minutes for one org, while another org is unaffected', async () => {
    for (let i = 0; i < 30; i++) expect((await clip({ url: URL_IN })).status).toBe(200);

    const res = await clip({ url: URL_IN });
    expect(res.status).toBe(429);
    expect(await readJson(res)).toEqual({ error: 'rate_limited' });
    expect(safeFetchHtml).toHaveBeenCalledTimes(30);

    signIn({ orgId: OTHER_ORG_ID });
    expect((await clip({ url: URL_IN })).status).toBe(200);

    signIn({ orgId: ORG_ID });
    vi.spyOn(Date, 'now').mockReturnValue(clock + 10 * 60 * 1000 + 1);
    expect((await clip({ url: URL_IN })).status).toBe(200);
  });

  it('does not count refused requests against the limit', async () => {
    for (let i = 0; i < 40; i++) expect((await clip({ url: 'nope' })).status).toBe(400);
    expect((await clip({ url: URL_IN })).status).toBe(200);
  });
});
