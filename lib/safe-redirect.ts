/**
 * Constrain a caller-supplied `?next=` to a path on this site.
 *
 * The sign-in flow carries this value through a query string and an email round
 * trip, so it is untrusted by the time it comes back. Without the check,
 * `/login?next=https://evil.example` produces a link that authenticates the user
 * and then hands them to somebody else's page — an open redirect, and a
 * convincing one precisely because the first half really is our sign-in.
 *
 * Rejected, and why each one matters:
 *   https://evil.example   absolute — different origin entirely
 *   //evil.example         protocol-relative; the browser reads this as a host,
 *                          and it is the case a naive `startsWith('/')` misses
 *   \\evil.example         some browsers normalise backslashes to slashes
 *   (empty)                not a path
 */
export const DEFAULT_NEXT = '/projects';

export function safeNext(raw: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!raw) return fallback;
  // Reject anything that is not a single-slash-prefixed path.
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  // A backslash in either of the first two positions can normalise into a
  // protocol-relative URL depending on the browser.
  if (raw.startsWith('/\\') || raw.startsWith('\\')) return fallback;
  return raw;
}
