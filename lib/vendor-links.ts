/**
 * Signed vendor reply links (FUT-5, first cut). Each line item in an outreach
 * email carries two links, "Item available" and "Item unavailable". A vendor
 * clicks one from their inbox and the order updates with no login.
 *
 * A link is a stateless HMAC token: nothing is stored, verification is a
 * recompute. The secret is VENDOR_LINK_SECRET; without it a dev secret is used
 * so the flow demos with zero secrets, and the server logs that once.
 *
 * Token shape: base64url(JSON claims) "." base64url(HMAC-SHA256 of that string).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ItemStatus, Order } from './orders';
import { RESPOND_PATH } from './outreach/constants';

export const VENDOR_ACTIONS = ['available', 'unavailable'] as const;
export type VendorAction = (typeof VENDOR_ACTIONS)[number];

/** What a vendor's answer means on the order. "Quoted" needs an amount, so "available" confirms. */
export const STATUS_FOR_ACTION: Record<VendorAction, ItemStatus> = {
  available: 'confirmed',
  unavailable: 'unavailable',
};

export const ACTION_LABEL: Record<VendorAction, string> = {
  available: 'Item available',
  unavailable: 'Item unavailable',
};

export type VendorActionClaims = {
  orderId: string;
  /** The order_items row, not the catalog item. */
  itemId: string;
  vendorId: string;
  action: VendorAction;
  /** Unix seconds. */
  exp: number;
};

export type VerifyResult =
  | { ok: true; claims: VendorActionClaims }
  | { ok: false; reason: 'invalid' | 'expired' };

export const LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

export { RESPOND_PATH } from './outreach/constants';

const DEV_SECRET = 'dev-only-vendor-link-secret';
let warned = false;

function secret(): string {
  const configured = process.env.VENDOR_LINK_SECRET;
  if (configured) return configured;
  // The dev secret is in the repo, so a production deploy must not sign with
  // it. VERCEL_ENV, not NODE_ENV: `next start` on a laptop is production too.
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('VENDOR_LINK_SECRET must be set in production');
  }
  if (!warned) {
    warned = true;
    console.warn('[vendor-links] VENDOR_LINK_SECRET is unset; signing with the dev secret. Set it before sending real email.');
  }
  return DEV_SECRET;
}

type Wire = { o: string; i: string; v: string; a: VendorAction; e: number };

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function signVendorAction(claims: VendorActionClaims): string {
  const wire: Wire = { o: claims.orderId, i: claims.itemId, v: claims.vendorId, a: claims.action, e: claims.exp };
  const payload = Buffer.from(JSON.stringify(wire)).toString('base64url');
  return `${payload}.${sign(payload, secret())}`;
}

export function verifyVendorAction(token: string, now = Date.now()): VerifyResult {
  const parsed = decode(token);
  if (!parsed) return { ok: false, reason: 'invalid' };
  if (parsed.claims.exp * 1000 < now) return { ok: false, reason: 'expired' };
  return { ok: true, claims: parsed.claims };
}

/** Claims issued `ttlSeconds` from now, for one order item and one answer. */
export function claimsFor(
  order: Pick<Order, 'id'>,
  item: { id: string; source: string },
  action: VendorAction,
  now = Date.now(),
  ttlSeconds = LINK_TTL_SECONDS,
): VendorActionClaims {
  return { orderId: order.id, itemId: item.id, vendorId: item.source, action, exp: Math.floor(now / 1000) + ttlSeconds };
}

export function vendorActionUrl(claims: VendorActionClaims): string {
  return `${appUrl()}${RESPOND_PATH}?t=${signVendorAction(claims)}`;
}

export type ReplyLinks = Record<VendorAction, string>;

/** The link builder compose takes: one pair per order line, signed for that order. */
export function replyLinksFor(order: Pick<Order, 'id'>): (line: { orderItemId: string; source: string }) => ReplyLinks {
  return (line) => ({
    available: vendorActionUrl(claimsFor(order, { id: line.orderItemId, source: line.source }, 'available')),
    unavailable: vendorActionUrl(claimsFor(order, { id: line.orderItemId, source: line.source }, 'unavailable')),
  });
}

const TOKEN_IN_TEXT = /vendor\/respond\?t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

/**
 * Re-sign every reply link in a stored email body with a fresh expiry, so a
 * retried send never carries a token that was minted weeks ago. A token that
 * does not verify is left as it is.
 */
export function refreshVendorLinks(body: string, now = Date.now()): string {
  return body.replace(TOKEN_IN_TEXT, (match, token: string) => {
    const parsed = decode(token);
    if (!parsed) return match;
    const fresh = { ...parsed.claims, exp: Math.floor(now / 1000) + LINK_TTL_SECONDS };
    return `vendor/respond?t=${signVendorAction(fresh)}`;
  });
}

/** The site's own origin for absolute links in email. Defaults to the dev server. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

// ---- internal ----

function decode(token: string): { claims: VendorActionClaims } | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(payload, secret());
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let wire: unknown;
  try {
    wire = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isWire(wire)) return null;
  return { claims: { orderId: wire.o, itemId: wire.i, vendorId: wire.v, action: wire.a, exp: wire.e } };
}

function isWire(x: unknown): x is Wire {
  if (!x || typeof x !== 'object') return false;
  const w = x as Record<string, unknown>;
  return (
    typeof w.o === 'string' &&
    typeof w.i === 'string' &&
    typeof w.v === 'string' &&
    (VENDOR_ACTIONS as readonly string[]).includes(w.a as string) &&
    typeof w.e === 'number' &&
    Number.isFinite(w.e)
  );
}
