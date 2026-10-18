import { describe, expect, it } from 'vitest';
import { accountDocumentsFrom, dedupe, fromInsuranceMinimum, fromVendorAsks, fromVendorForm, vendorDisplayName } from './vendor';

describe('vendor requirements', () => {
  it('maps a vendor form to the library requirement it stands for, with the vendor named', () => {
    expect(fromVendorForm({ vendorId: 'omega', kind: 'coi_request', label: 'Certificate of insurance request' })).toEqual({
      vendorId: 'omega',
      vendorName: 'Omega Cinema Props',
      requirementId: 'certificate_of_insurance',
      reason: 'Omega Cinema Props asks new customers for a certificate of insurance request.',
    });
    expect(fromVendorForm({ vendorId: 'propheaven', kind: 'w9_request', label: 'W-9 request' })?.requirementId).toBe('w9');
    expect(fromVendorForm({ vendorId: 'omega', kind: 'credit_application', label: 'Credit application' })?.requirementId).toBe('vendor_account_application');
    expect(fromVendorForm({ vendorId: 'omega', kind: 'other', label: 'Something' })).toBeNull();
  });

  it('turns insurance minimums into a COI requirement that states them', () => {
    expect(
      fromInsuranceMinimum({ vendorId: 'hpr', vendorName: 'HPR', glLimit: 1_000_000, aggregateLimit: 2_000_000, workersCompRequired: true, additionalInsuredRequired: true }),
    ).toEqual({
      vendorId: 'hpr',
      vendorName: 'HPR',
      requirementId: 'certificate_of_insurance',
      reason: 'HPR requires a certificate showing general liability of $1,000,000, additional insured status, workers compensation.',
    });
  });

  it('turns what a house asks a new customer for into requirements, for the kinds that have a checklist line', () => {
    // Omega holds a card for a first rental and, like every house, wants a COI.
    expect(fromVendorAsks('omega')).toEqual([
      { vendorId: 'omega', vendorName: 'Omega Cinema Props', requirementId: 'certificate_of_insurance', reason: 'Omega Cinema Props asks new customers for a certificate of insurance.' },
      { vendorId: 'omega', vendorName: 'Omega Cinema Props', requirementId: 'credit_card_authorization', reason: 'Omega Cinema Props asks new customers for a credit card authorization.' },
    ]);
    // Universal takes the card through its own portal: only the COI.
    expect(fromVendorAsks('universal').map((r) => r.requirementId)).toEqual(['certificate_of_insurance']);
    expect(fromVendorAsks('mystery')).toEqual([]);
  });

  it('reads the passport as account documents, one per kind that satisfies a requirement', () => {
    const doc = { storagePath: 'o/p/a.pdf', name: 'a.pdf', mime: 'application/pdf', uploadedAt: '2026-09-01T00:00:00Z' };
    expect(accountDocumentsFrom({ documents: {} })).toEqual([]);
    expect(
      accountDocumentsFrom({
        documents: { coi: { ...doc, name: 'coi.pdf' }, credit_card_authorization: { ...doc, name: 'card.pdf' }, drivers_license: doc },
      }),
    ).toEqual([
      { requirementId: 'certificate_of_insurance', name: 'coi.pdf' },
      { requirementId: 'credit_card_authorization', name: 'card.pdf' },
    ]);
  });

  it('lists one requirement per vendor and document, and names unknown vendors by id', () => {
    const coi = { vendorId: 'omega', vendorName: 'Omega', requirementId: 'certificate_of_insurance', reason: 'a' };
    expect(dedupe([coi, { ...coi, reason: 'b' }, { ...coi, requirementId: 'w9' }])).toHaveLength(2);
    expect(vendorDisplayName('omega')).toBe('Omega Cinema Props');
    expect(vendorDisplayName('mystery')).toBe('mystery');
  });
});
