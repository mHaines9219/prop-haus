/**
 * Is this a URL we are willing to render as a link?
 *
 * WHY THIS EXISTS. `vendor_requests.coi_cert_url` is free text supplied through
 * the COI panel and rendered as an anchor. `javascript:alert(1)` in an href
 * executes on click, so a certificate URL is a stored-XSS vector unless the
 * scheme is checked. Before #47 anyone could write that column; now only an
 * owner can, but the value is rendered on a page that a share link can put in
 * front of a client, so "only the owner can poison it" is not a defence — it
 * makes the owner the attacker's delivery mechanism rather than the target.
 *
 * ALLOW-LIST, not a block-list. Blocking `javascript:` invites `JaVaScRiPt:`,
 * `java\tscript:`, `data:text/html`, and `vbscript:`. Naming the two schemes a
 * certificate can legitimately use is a smaller thing to get right.
 *
 * Relative URLs are rejected too. This function guards values that arrive from
 * outside; a relative href is never what a vendor's certificate host produces,
 * and permitting it would let `//evil.example/x` through as protocol-relative.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeExternalUrl(value: string | undefined | null): boolean {
  if (!value) return false;

  let parsed: URL;
  try {
    // Absolute parse with no base: a relative or protocol-relative string throws
    // here rather than being resolved against something convenient.
    parsed = new URL(value);
  } catch {
    return false;
  }

  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}

/** The URL when it is safe to link, otherwise undefined — shaped for `href={...}`. */
export function safeExternalUrl(value: string | undefined | null): string | undefined {
  return isSafeExternalUrl(value) ? (value as string) : undefined;
}
