import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF-guarded fetch for the web clipper (MVP-7).
 *
 * `/api/clip` fetches an arbitrary URL a user pasted, on our server and our
 * network. Without a guard, `http://169.254.169.254/…` (cloud metadata),
 * `http://10.0.0.5/admin` (internal services), or `http://localhost:5432`
 * (our own Postgres) are all reachable from inside our perimeter — the classic
 * SSRF shape. `lib/safe-url.ts` only checks the scheme; it does not resolve the
 * host, so it cannot stop any of these.
 *
 * What this module enforces:
 *   - https only (no http, no file:, no gopher:, no data:).
 *   - Every DNS answer for the host must be a public unicast address. Private,
 *     loopback, link-local (incl. 169.254.169.254), CGNAT, and IPv6 ULA/
 *     link-local ranges are rejected.
 *   - Redirects are followed manually, at most MAX_REDIRECTS hops, and the host
 *     is re-resolved and re-checked on EVERY hop (a redirect to an internal host
 *     is the standard bypass).
 *   - A hard timeout and a byte cap, so a slow-loris or a multi-GB body can't
 *     tie up or OOM the function.
 *
 * KNOWN LIMIT (accepted for v1, flagged in the PR): there is a TOCTOU window
 * between resolving the host here and `fetch()` re-resolving it — a DNS-rebind
 * attacker could return a public IP to us and a private IP to fetch(). Closing
 * it fully means pinning the socket to the vetted IP, which node's fetch does
 * not expose. The blast radius is a single attacker reading their own internal
 * response back through a clip preview; the brief judged clipping low-risk.
 */

export type SafeFetchReason =
  | 'invalid' // not a URL, or not https
  | 'blocked' // resolves to a private/loopback/link-local address
  | 'timeout'
  | 'too-large'
  | 'too-many-redirects'
  | 'http'; // upstream returned a non-OK status (403 bot wall, 404, 5xx…)

export class SafeFetchError extends Error {
  constructor(
    readonly reason: SafeFetchReason,
    message: string,
  ) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3 MB

// A realistic desktop-Chrome UA + Accept headers. Retail sites serve bot
// challenges to obvious crawler UAs; this reduces (never eliminates) 403s.
const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

/** Is this a literal IP we must never let the server reach? */
export function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedV4(ip);
  if (kind === 6) return isBlockedV6(ip);
  // Not a literal address — caller resolves DNS first, so this shouldn't happen.
  return true;
}

function isBlockedV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224+/multicast + reserved/broadcast
  return false;
}

function isBlockedV6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // drop any zone id
  if (addr === '::' || addr === '::1') return true; // unspecified + loopback
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — defer to the v4 rules.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (addr.startsWith('fe80')) return true; // link-local
  const head = parseInt(addr.slice(0, 2), 16);
  if (!Number.isNaN(head) && (head & 0xfe) === 0xfc) return true; // fc00::/7 ULA
  return false;
}

/**
 * Parse `raw`, require https, resolve the host, and reject unless EVERY
 * resolved address is public. Returns the vetted URL. Throws SafeFetchError.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('invalid', 'not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new SafeFetchError('invalid', 'only https URLs can be clipped');
  }

  const host = url.hostname;
  // A literal IP in the URL never touches DNS — check it directly.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new SafeFetchError('blocked', 'address is not publicly routable');
    }
    return url;
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new SafeFetchError('blocked', 'host does not resolve');
  }
  if (records.length === 0) {
    throw new SafeFetchError('blocked', 'host does not resolve');
  }
  for (const { address } of records) {
    if (isBlockedAddress(address)) {
      throw new SafeFetchError('blocked', 'host resolves to a non-public address');
    }
  }
  return url;
}

async function readCapped(res: Response, cap: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) {
    throw new SafeFetchError('too-large', 'response exceeds size cap');
  }
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        throw new SafeFetchError('too-large', 'response exceeds size cap');
      }
      chunks.push(value);
    }
  }
  return new TextDecoder('utf-8').decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export type SafeFetchResult = { finalUrl: string; html: string };

/**
 * Fetch HTML from a user-supplied URL with the SSRF guard, redirect cap,
 * timeout, and byte cap applied. `finalUrl` is the post-redirect location.
 */
export async function safeFetchHtml(raw: string): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = raw;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(current); // re-vetted every hop
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: BROWSER_HEADERS,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new SafeFetchError('timeout', 'request timed out');
        }
        throw new SafeFetchError('http', `fetch failed: ${(err as Error).message}`);
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new SafeFetchError('http', 'redirect without a location');
        await res.body?.cancel();
        current = new URL(location, url).toString();
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();
        throw new SafeFetchError('http', `upstream returned ${res.status}`);
      }

      const html = await readCapped(res, MAX_HTML_BYTES);
      return { finalUrl: url.toString(), html };
    }
    throw new SafeFetchError('too-many-redirects', 'too many redirects');
  } finally {
    clearTimeout(timer);
  }
}
