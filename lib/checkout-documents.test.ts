import { describe, expect, it } from 'vitest';
import { askedByLine, cartDocuments } from './checkout-documents';
import type { PassportDocument } from './passport';
import type { Vendor } from './vendors';

/**
 * The cart's Documents group is computed, never configured: which vendors are
 * in the cart decides what is asked for, and the passport decides what is
 * already answered. Unknown vendors fall back to what every house asks for.
 */

const DOC: PassportDocument = {
  storagePath: 'org/passport/a.pdf',
  name: 'a.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
};

const vendors: Record<string, Vendor> = {
  omega: { id: 'omega', name: 'Omega Cinema Props', city: 'LA', website: 'https://omega.example', tier: 'easy', asksFor: ['credit_card_authorization', 'w9'] },
  hpr: { id: 'hpr', name: 'Hand Prop Room', city: 'LA', website: 'https://hpr.example', tier: 'easy', asksFor: ['credit_card_authorization'] },
  objects: { id: 'objects', name: 'OBJECTS', city: 'LA', website: 'https://objects.example', tier: 'easy' },
};

const now = new Date('2026-10-18T12:00:00Z');

describe('cartDocuments', () => {
  it('is empty for an empty cart', () => {
    expect(cartDocuments([], { documents: {} }, now, vendors)).toEqual([]);
  });

  it('lists what the cart vendors ask for, in passport order, naming who asks', () => {
    const docs = cartDocuments(['omega', 'hpr', 'omega'], { documents: {} }, now, vendors);
    expect(docs.map((d) => d.kind)).toEqual(['w9', 'coi', 'credit_card_authorization']);
    const card = docs.find((d) => d.kind === 'credit_card_authorization')!;
    expect(card.askedBy).toEqual(['Omega Cinema Props', 'Hand Prop Room']);
    expect(card.askedByAll).toBe(true);
    expect(card.status).toBe('missing');
    const w9 = docs.find((d) => d.kind === 'w9')!;
    expect(w9.askedBy).toEqual(['Omega Cinema Props']);
    expect(w9.askedByAll).toBe(false);
  });

  it('asks a vendor with no list, or an unknown vendor, only for what every house wants', () => {
    expect(cartDocuments(['objects'], { documents: {} }, now, vendors).map((d) => d.kind)).toEqual(['coi']);
    const docs = cartDocuments(['mystery'], { documents: {} }, now, vendors);
    expect(docs.map((d) => d.kind)).toEqual(['coi']);
    expect(docs[0].askedBy).toEqual(['mystery']);
  });

  it('marks a slot on file, expired, or missing from the passport', () => {
    const docs = cartDocuments(
      ['omega'],
      { documents: { coi: DOC, credit_card_authorization: { ...DOC, expiresAt: '2026-01-31' } } },
      now,
      vendors,
    );
    const by = Object.fromEntries(docs.map((d) => [d.kind, d]));
    expect(by.coi.status).toBe('on_file');
    expect(by.coi.document).toEqual(DOC);
    expect(by.credit_card_authorization.status).toBe('expired');
    expect(by.w9.status).toBe('missing');
    expect(by.w9.document).toBeUndefined();
  });

  it('explains who asks in one line', () => {
    const docs = cartDocuments(['omega', 'hpr', 'objects'], { documents: {} }, now, vendors);
    const coi = docs.find((d) => d.kind === 'coi')!;
    const card = docs.find((d) => d.kind === 'credit_card_authorization')!;
    expect(askedByLine(coi)).toBe('Every vendor in your cart asks for this.');
    expect(askedByLine(card)).toBe('Asked for by Omega Cinema Props and Hand Prop Room.');
  });
});
