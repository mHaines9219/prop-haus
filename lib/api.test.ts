import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, deleteJson, getJson, postForm, postJson } from './api';

/**
 * Every client fetch funnels through parse(); the shape of what it throws is
 * what mutation error handlers and query retries key on.
 */

const fetchMock = vi.fn<typeof fetch>();

function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJson', () => {
  it('returns the parsed body on 2xx', async () => {
    respond({ ok: true, n: 1 });
    await expect(getJson<{ n: number }>('/api/x')).resolves.toEqual({ ok: true, n: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', undefined);
  });

  it('passes init through', async () => {
    respond({});
    const signal = AbortSignal.abort();
    await getJson('/api/x', { signal, cache: 'no-store' });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { signal, cache: 'no-store' });
  });

  it('throws an ApiError carrying the body error and status on non-OK', async () => {
    respond({ error: 'no such order' }, 404);
    const err = await getJson('/api/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: 'ApiError', message: 'no such order', status: 404 });
  });

  it('falls back to HTTP <status> when the failure body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 502 }));
    await expect(getJson('/api/x')).rejects.toMatchObject({ message: 'HTTP 502', status: 502 });
  });

  it('falls back to HTTP <status> when the failure body has no error string', async () => {
    respond({ detail: 'x' }, 500);
    await expect(getJson('/api/x')).rejects.toMatchObject({ message: 'HTTP 500', status: 500 });
  });

  it('treats an { error } payload on a 200 as a failure', async () => {
    respond({ error: 'quota exceeded', matches: [] });
    await expect(getJson('/api/x')).rejects.toMatchObject({ message: 'quota exceeded', status: 200 });
  });

  it('resolves null for an OK response with no JSON body', async () => {
    respond(undefined, 204);
    await expect(getJson('/api/x')).resolves.toBeNull();
  });

  it('propagates a network failure as-is', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getJson('/api/x')).rejects.toThrow('Failed to fetch');
  });
});

describe('postJson', () => {
  it('sends a JSON body with the content-type header', async () => {
    respond({ id: 'o1' }, 201);
    await expect(postJson('/api/checkout', { lines: [] })).resolves.toEqual({ id: 'o1' });
    expect(fetchMock).toHaveBeenCalledWith('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"lines":[]}',
    });
  });

  it('lets init override the defaults', async () => {
    respond({});
    await postJson('/api/x', {}, { method: 'PATCH', headers: { 'x-a': '1' } });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', headers: { 'x-a': '1' } });
  });

  it('throws on failure like getJson', async () => {
    respond({ error: 'idempotencyKey is required' }, 400);
    await expect(postJson('/api/checkout', {})).rejects.toMatchObject({ status: 400, message: 'idempotencyKey is required' });
  });
});

describe('postForm', () => {
  it('posts the FormData without a content-type header', async () => {
    respond({ uploaded: 1 });
    const form = new FormData();
    form.append('files', new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    await expect(postForm('/api/upload', form)).resolves.toEqual({ uploaded: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/upload');
    expect(init).toMatchObject({ method: 'POST', body: form });
    expect(init).not.toHaveProperty('headers');
  });
});

describe('deleteJson', () => {
  it('sends DELETE and parses the reply', async () => {
    respond({ ok: true });
    await expect(deleteJson('/api/projects/p1')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1', { method: 'DELETE' });
  });

  it('throws on failure', async () => {
    respond({ error: 'not yours' }, 403);
    await expect(deleteJson('/api/projects/p1')).rejects.toMatchObject({ status: 403 });
  });
});
