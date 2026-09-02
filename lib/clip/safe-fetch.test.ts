import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SafeFetchError, assertPublicUrl, isBlockedAddress, safeFetchHtml } from './safe-fetch';
import { canonicalizeUrl, retailerNameFor } from './retailers';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ default: { lookup } }));

describe('isBlockedAddress', () => {
  it('blocks the private, loopback, link-local, and metadata ranges (v4)', () => {
    for (const ip of [
      '0.0.0.0',
      '10.0.0.5',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata
      '172.16.4.4',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows normal public v4 addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('blocks loopback, ULA, link-local, and mapped-private (v6)', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public v6 addresses', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('rejects non-https schemes', async () => {
    await expect(assertPublicUrl('http://example.com')).rejects.toBeInstanceOf(SafeFetchError);
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SafeFetchError);
  });

  it('rejects a literal private IP without a DNS lookup', async () => {
    await expect(assertPublicUrl('https://127.0.0.1/admin')).rejects.toMatchObject({
      reason: 'blocked',
    });
    await expect(assertPublicUrl('https://169.254.169.254/latest/meta-data')).rejects.toMatchObject(
      { reason: 'blocked' },
    );
  });

  it('rejects a garbage string', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toMatchObject({ reason: 'invalid' });
  });
});

describe('canonicalizeUrl', () => {
  it('strips tracking params and the fragment, lowercases the host', () => {
    const out = canonicalizeUrl(
      'https://WWW.Wayfair.com/furniture/pdp/sofa-w123.html?utm_source=pin&gclid=abc&piid=99#reviews',
    );
    expect(out).toBe('https://www.wayfair.com/furniture/pdp/sofa-w123.html?piid=99');
  });

  it('is idempotent — canonical of canonical is unchanged', () => {
    const once = canonicalizeUrl('https://example.com/p?utm_medium=x&keep=1');
    expect(canonicalizeUrl(once)).toBe(once);
    expect(once).toBe('https://example.com/p?keep=1');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(canonicalizeUrl('::::')).toBe('::::');
  });
});

describe('retailerNameFor', () => {
  it('names known retailers and falls back to the bare hostname', () => {
    expect(retailerNameFor('https://www.wayfair.com/x')).toBe('Wayfair');
    expect(retailerNameFor('https://www.cb2.com/x')).toBe('cb2.com');
  });
});

describe('isBlockedAddress boundaries', () => {
  it('blocks anything that is not a literal address', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
    expect(isBlockedAddress('1.2.3')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });

  it('lets a mapped public v4 through and stops at the ULA edges', () => {
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedAddress('fdff::1')).toBe(true);
    expect(isBlockedAddress('fb00::1')).toBe(false);
    expect(isBlockedAddress('fe00::1')).toBe(false);
  });
});

describe('assertPublicUrl with DNS', () => {
  beforeEach(() => lookup.mockReset());

  it('resolves every address and rejects if any one is private', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '10.0.0.1' }]);
    await expect(assertPublicUrl('https://example.com/x')).rejects.toMatchObject({
      reason: 'blocked',
      message: 'host resolves to a non-public address',
    });
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('rejects a host that does not resolve, or resolves to nothing', async () => {
    lookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(assertPublicUrl('https://nope.invalid/')).rejects.toMatchObject({ message: 'host does not resolve' });
    lookup.mockResolvedValueOnce([]);
    await expect(assertPublicUrl('https://nope.invalid/')).rejects.toMatchObject({ message: 'host does not resolve' });
  });

  it('returns the parsed URL when every address is public', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '2606:4700::1111' }]);
    const url = await assertPublicUrl('https://Example.com/a?b=1');
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe('example.com');
  });
});

describe('safeFetchHtml', () => {
  const ORIGIN = 'https://93.184.216.34';
  const fetchMock = vi.fn<typeof fetch>();
  const html = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } });
  const redirect = (location?: string) =>
    new Response(null, { status: 302, headers: location ? { location } : {} });
  const calledUrl = (i: number) => String(fetchMock.mock.calls[i][0]);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the body and the final url with browser-like headers and manual redirects', async () => {
    fetchMock.mockResolvedValueOnce(html('<p>hi</p>'));
    expect(await safeFetchHtml(`${ORIGIN}/p`)).toEqual({ finalUrl: `${ORIGIN}/p`, html: '<p>hi</p>' });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/Chrome/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('re-vets the host on every hop, so a redirect into a private range is blocked', async () => {
    fetchMock.mockResolvedValueOnce(redirect('https://10.0.0.5/admin'));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'blocked' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect down to http', async () => {
    fetchMock.mockResolvedValueOnce(redirect('http://93.184.216.34/p'));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('resolves a relative Location against the current url and reports where it landed', async () => {
    fetchMock.mockResolvedValueOnce(redirect('/next?x=1'));
    fetchMock.mockResolvedValueOnce(html('landed'));
    const out = await safeFetchHtml(`${ORIGIN}/a/b`);
    expect(calledUrl(1)).toBe(`${ORIGIN}/next?x=1`);
    expect(out).toEqual({ finalUrl: `${ORIGIN}/next?x=1`, html: 'landed' });
  });

  it('follows three redirects and gives up on the fourth', async () => {
    for (let i = 0; i < 4; i++) fetchMock.mockResolvedValueOnce(redirect(`${ORIGIN}/r${i}`));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'too-many-redirects' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects a redirect that carries no Location', async () => {
    fetchMock.mockResolvedValueOnce(redirect());
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'http', message: 'redirect without a location' });
  });

  it('reports a non-OK upstream as http with the status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bot wall', { status: 403 }));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'http', message: 'upstream returned 403' });
  });

  it('refuses a body whose declared length is over 3 MB without reading it', async () => {
    fetchMock.mockResolvedValueOnce(html('tiny', { 'content-length': String(3 * 1024 * 1024 + 1) }));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('refuses a streamed body that grows past 3 MB', async () => {
    const chunk = new Uint8Array(2 * 1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200 }));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('reads an empty body as an empty string', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect((await safeFetchHtml(`${ORIGIN}/p`)).html).toBe('');
  });

  it('reports a network failure as http', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(safeFetchHtml(`${ORIGIN}/p`)).rejects.toMatchObject({ reason: 'http', message: 'fetch failed: ECONNREFUSED' });
  });

  it('aborts after the timeout and reports it as such', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const outcome = safeFetchHtml(`${ORIGIN}/slow`).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await outcome).toMatchObject({ reason: 'timeout', message: 'request timed out' });
  });

  it('never fetches when the first url is not https', async () => {
    await expect(safeFetchHtml('http://93.184.216.34/p')).rejects.toMatchObject({ reason: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
