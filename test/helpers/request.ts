/** Request builders for route-handler tests. Routes are called as plain functions. */

const BASE = 'http://localhost:3000';

export function getRequest(path: string, init: RequestInit = {}): Request {
  return new Request(new URL(path, BASE), { method: 'GET', ...init });
}

export function jsonRequest(path: string, body: unknown, init: RequestInit = {}): Request {
  return new Request(new URL(path, BASE), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

/** A POST whose body is not JSON at all — for the "malformed body" edge. */
export function rawRequest(path: string, body: string, init: RequestInit = {}): Request {
  return new Request(new URL(path, BASE), { method: 'POST', body, ...init });
}

export function formRequest(path: string, form: FormData, init: RequestInit = {}): Request {
  return new Request(new URL(path, BASE), { method: 'POST', body: form, ...init });
}

export function fileOf(name: string, mime: string, bytes: number | Uint8Array): File {
  const data = typeof bytes === 'number' ? new Uint8Array(bytes).fill(1) : bytes;
  return new File([data as BlobPart], name, { type: mime });
}

export async function readJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Route params arrive as a promise in Next 15. */
export function params<T extends Record<string, string>>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}
