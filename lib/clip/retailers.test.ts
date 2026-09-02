import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, hostnameLabel, retailerNameFor, retailerRuleFor } from './retailers';

/**
 * Per-retailer overrides and the URL identity of a clip. The canonical form
 * is a folder's dedupe key, so what it strips and what it keeps is pinned.
 */

describe('retailerRuleFor', () => {
  it('matches the bare host, www and any subdomain, case-insensitively', () => {
    for (const url of [
      'https://wayfair.com/x',
      'https://www.wayfair.com/x',
      'https://secure.checkout.wayfair.com/x',
      'https://WWW.WAYFAIR.COM/x',
    ]) {
      expect(retailerRuleFor(url)?.retailer, url).toBe('Wayfair');
    }
  });

  it('does not match a host that merely ends with the same letters', () => {
    expect(retailerRuleFor('https://notwayfair.com/x')).toBeUndefined();
    expect(retailerRuleFor('https://wayfair.com.evil.net/x')).toBeUndefined();
  });

  it('is undefined for an unknown host or an unparseable string', () => {
    expect(retailerRuleFor('https://cb2.com/x')).toBeUndefined();
    expect(retailerRuleFor('not a url')).toBeUndefined();
  });
});

describe('the Wayfair image rule', () => {
  const refine = retailerRuleFor('https://www.wayfair.com/x')!.refineImage!;

  it('strips the downscaling query from wfcdn assets', () => {
    expect(refine('https://assets.wfcdn.com/im/1/resize-h300/sofa.jpg?resize=h300&x=1')).toBe(
      'https://assets.wfcdn.com/im/1/resize-h300/sofa.jpg',
    );
  });

  it('leaves other hosts and garbage alone', () => {
    expect(refine('https://cdn.other.com/a.jpg?w=100')).toBe('https://cdn.other.com/a.jpg?w=100');
    expect(refine('::not-a-url::')).toBe('::not-a-url::');
  });
});

describe('retailerNameFor and hostnameLabel', () => {
  it('prefers the override, then the www-stripped host, then the raw string', () => {
    expect(retailerNameFor('https://m.wayfair.com/x')).toBe('Wayfair');
    expect(retailerNameFor('https://www.cb2.com/x')).toBe('cb2.com');
    expect(retailerNameFor('garbage')).toBe('garbage');
  });

  it('hostnameLabel strips only a leading www', () => {
    expect(hostnameLabel('https://www.example.com/a')).toBe('example.com');
    expect(hostnameLabel('https://shop.www.example.com/a')).toBe('shop.www.example.com');
    expect(hostnameLabel('https://wwwexample.com/a')).toBe('wwwexample.com');
    expect(hostnameLabel('nope')).toBe('nope');
  });
});

describe('canonicalizeUrl', () => {
  it('drops every utm_* key and the known click trackers regardless of case', () => {
    const out = canonicalizeUrl(
      'https://shop.com/p?UTM_Campaign=a&utm_x=b&fbclid=1&REF=r&mc_cid=2&_branch_match_id=3&sku=9',
    );
    expect(out).toBe('https://shop.com/p?sku=9');
  });

  it('keeps product-identifying params in their original order', () => {
    expect(canonicalizeUrl('https://shop.com/p?b=2&a=1&utm_source=x')).toBe('https://shop.com/p?b=2&a=1');
  });

  it('lowercases the host but not the path', () => {
    expect(canonicalizeUrl('https://Shop.COM/Product/Sofa')).toBe('https://shop.com/Product/Sofa');
  });

  it('drops the fragment even when it is the only extra', () => {
    expect(canonicalizeUrl('https://shop.com/p#reviews')).toBe('https://shop.com/p');
  });

  it('does not add a trailing question mark once every param is stripped', () => {
    expect(canonicalizeUrl('https://shop.com/p?utm_source=x')).toBe('https://shop.com/p');
  });
});
