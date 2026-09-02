import { describe, expect, it } from 'vitest';
import { SOURCES, SOURCE_META } from './types';
import { VENDORS, vendorRef } from './vendors';

/**
 * VENDORS is hand-maintained beside SOURCE_META. A source added to one and not
 * the other breaks attribution on every card, so the two are held in lockstep.
 */

const TIERS = ['easy', 'medium', 'hard'];

describe('VENDORS', () => {
  it('has exactly one entry per source and nothing else', () => {
    expect(Object.keys(VENDORS).sort()).toEqual([...SOURCES].sort());
  });

  it.each(SOURCES)('%s mirrors SOURCE_META and carries a valid tier', (source) => {
    const v = VENDORS[source];
    expect(v.id).toBe(source);
    expect(v.name).toBe(SOURCE_META[source].name);
    expect(v.website).toBe(SOURCE_META[source].url);
    expect(v.city).toBe('LA');
    expect(TIERS).toContain(v.tier);
  });

  it('routes orders to an orders@ mailbox for every vendor with a site of its own', () => {
    for (const v of Object.values(VENDORS)) {
      if (v.id === 'artdimensions') expect(v.orderEmail).toBeUndefined();
      else expect(v.orderEmail).toMatch(/^orders@[a-z0-9.-]+\.[a-z]+$/);
    }
  });

  it('keeps a catalog url on the vendor domain when present', () => {
    for (const v of Object.values(VENDORS)) {
      if (!v.catalogUrl) continue;
      expect(new URL(v.catalogUrl).host).toBe(new URL(v.website).host);
    }
  });
});

describe('vendorRef', () => {
  it('builds the VendorRef shape a catalog item embeds', () => {
    expect(vendorRef('omega')).toEqual({
      id: 'omega',
      name: 'Omega Cinema Props',
      city: 'LA',
      sourceUrl: 'https://omegacinemaprops.com',
    });
  });

  it('never leaks tier, notes or the order mailbox into the ref', () => {
    expect(Object.keys(vendorRef('hpr')).sort()).toEqual(['city', 'id', 'name', 'sourceUrl']);
  });
});
