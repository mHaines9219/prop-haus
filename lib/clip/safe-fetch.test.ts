import { describe, expect, it } from 'vitest';
import { SafeFetchError, assertPublicUrl, isBlockedAddress } from './safe-fetch';
import { canonicalizeUrl, retailerNameFor } from './retailers';

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
