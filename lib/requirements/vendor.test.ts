import { describe, expect, it } from 'vitest';
import { dedupe, fromInsuranceMinimum, fromVendorForm, vendorDisplayName } from './vendor';

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

  it('lists one requirement per vendor and document, and names unknown vendors by id', () => {
    const coi = { vendorId: 'omega', vendorName: 'Omega', requirementId: 'certificate_of_insurance', reason: 'a' };
    expect(dedupe([coi, { ...coi, reason: 'b' }, { ...coi, requirementId: 'w9' }])).toHaveLength(2);
    expect(vendorDisplayName('omega')).toBe('Omega Cinema Props');
    expect(vendorDisplayName('mystery')).toBe('mystery');
  });
});
