import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimsFor,
  refreshVendorLinks,
  replyLinksFor,
  signVendorAction,
  verifyVendorAction,
  vendorActionUrl,
  type VendorActionClaims,
} from './vendor-links';

const NOW = Date.parse('2026-11-06T12:00:00Z');

const claims: VendorActionClaims = {
  orderId: 'order-1',
  itemId: 'oi-1',
  vendorId: 'omega',
  action: 'available',
  exp: Math.floor(NOW / 1000) + 3600,
};

beforeEach(() => {
  vi.stubEnv('VENDOR_LINK_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prophaus.example/');
});
afterEach(() => vi.unstubAllEnvs());

describe('signVendorAction / verifyVendorAction', () => {
  it('round-trips the claims', () => {
    const token = signVendorAction(claims);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyVendorAction(token, NOW)).toEqual({ ok: true, claims });
  });

  it('rejects a tampered payload', () => {
    const token = signVendorAction(claims);
    const [payload, sig] = token.split('.');
    const flipped = JSON.parse(Buffer.from(payload, 'base64url').toString());
    flipped.a = 'unavailable';
    const forged = `${Buffer.from(JSON.stringify(flipped)).toString('base64url')}.${sig}`;
    expect(verifyVendorAction(forged, NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a tampered signature, a missing dot, and garbage', () => {
    const token = signVendorAction(claims);
    const bad = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyVendorAction(bad, NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyVendorAction(token.replace('.', ''), NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyVendorAction('', NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyVendorAction('a.b', NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an expired token', () => {
    const token = signVendorAction(claims);
    expect(verifyVendorAction(token, (claims.exp + 1) * 1000)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token signed with another secret', () => {
    const token = signVendorAction(claims);
    vi.stubEnv('VENDOR_LINK_SECRET', 'someone-else');
    expect(verifyVendorAction(token, NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('falls back to a dev secret and warns once when the var is unset', () => {
    vi.stubEnv('VENDOR_LINK_SECRET', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = signVendorAction(claims);
    expect(verifyVendorAction(token, NOW).ok).toBe(true);
    signVendorAction(claims);
    expect(warn.mock.calls.filter(([m]) => String(m).includes('VENDOR_LINK_SECRET')).length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});

describe('claimsFor and links', () => {
  it('issues claims for the order item with a 30 day expiry', () => {
    const c = claimsFor({ id: 'order-1' }, { id: 'oi-1', source: 'omega' }, 'unavailable', NOW);
    expect(c).toEqual({ orderId: 'order-1', itemId: 'oi-1', vendorId: 'omega', action: 'unavailable', exp: Math.floor(NOW / 1000) + 30 * 86400 });
  });

  it('builds an absolute respond URL on the app origin without a double slash', () => {
    const url = vendorActionUrl(claims);
    expect(url.startsWith('https://prophaus.example/vendor/respond?t=')).toBe(true);
    const token = new URL(url).searchParams.get('t')!;
    expect(verifyVendorAction(token, NOW)).toEqual({ ok: true, claims });
  });

  it('replyLinksFor gives one verifiable link per action for the line', () => {
    const links = replyLinksFor({ id: 'order-7' })({ orderItemId: 'oi-9', source: 'hpr' });
    for (const action of ['available', 'unavailable'] as const) {
      const token = new URL(links[action]).searchParams.get('t')!;
      const result = verifyVendorAction(token);
      expect(result.ok && result.claims).toMatchObject({ orderId: 'order-7', itemId: 'oi-9', vendorId: 'hpr', action });
    }
  });
});

describe('refreshVendorLinks', () => {
  it('re-signs every link in a body with a fresh expiry and keeps the rest of the text', () => {
    const stale = { ...claims, exp: Math.floor(NOW / 1000) - 10 };
    const body = `Yes: ${vendorActionUrl(stale)}\nNo: ${vendorActionUrl({ ...stale, action: 'unavailable' })}\nItem: https://omega.example/item/1`;
    const later = NOW + 86400_000;
    const fresh = refreshVendorLinks(body, later);
    const tokens = [...fresh.matchAll(/t=([^\s]+)/g)].map((m) => m[1]);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      const result = verifyVendorAction(token, later);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.claims.exp).toBe(Math.floor(later / 1000) + 30 * 86400);
    }
    expect(fresh).toContain('Item: https://omega.example/item/1');
    expect(fresh).not.toBe(body);
  });

  it('leaves a token it cannot verify alone', () => {
    const body = 'https://prophaus.example/vendor/respond?t=abc.def';
    expect(refreshVendorLinks(body)).toBe(body);
  });
});

describe('the production guard', () => {
  it('refuses to sign with the dev secret on a production deploy', () => {
    vi.stubEnv('VENDOR_LINK_SECRET', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => signVendorAction(claims)).toThrow('VENDOR_LINK_SECRET must be set in production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(signVendorAction(claims)).toMatch(/\./);
    warn.mockRestore();
  });
});
