// Shared client-side fetch helpers.
//
// Every client fetch used to repeat the same shape: call fetch, parse JSON,
// check `r.ok` and an optional `data.error`, then branch. These helpers
// centralize that so callers (and TanStack Query query/mutation fns) just get
// typed data or a thrown Error.

/** Thrown on a non-OK response or an `{ error }` payload. Carries the status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  // Some endpoints return `{ error }` with a 200; tolerate non-JSON bodies too.
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || data?.error) {
    throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

/** GET a JSON endpoint. */
export function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then((r) => parse<T>(r));
}

/** POST a JSON body. */
export function postJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  }).then((r) => parse<T>(r));
}

/** POST multipart form data (file uploads, moodboards). */
export function postForm<T>(url: string, form: FormData, init?: RequestInit): Promise<T> {
  return fetch(url, { method: 'POST', body: form, ...init }).then((r) => parse<T>(r));
}

/** DELETE a JSON endpoint. */
export function deleteJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, { method: 'DELETE', ...init }).then((r) => parse<T>(r));
}
