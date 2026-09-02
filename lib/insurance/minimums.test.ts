import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The compatibility check is the only thing standing between "COI on file"
 * and a vendor refusing the delivery. Every gap combination is enumerated.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { db } from '@/test/mocks/supabase-admin';
import { checkCompatibility, getVendorMinimums, type InsuranceProfile, type VendorInsuranceMinimum } from './minimums';

const MIN: VendorInsuranceMinimum = {
  vendorId: 'omega',
  vendorName: 'Omega Cinema Props',
  glLimit: 1_000_000,
  aggregateLimit: 2_000_000,
  workersCompRequired: false,
  additionalInsuredRequired: false,
};

const FULL: InsuranceProfile = {
  glLimit: 1_000_000,
  aggregateLimit: 2_000_000,
  workersCompLimit: 500_000,
  additionalInsuredAvailable: true,
};

describe('checkCompatibility', () => {
  it('is compatible when limits meet the minimums exactly', () => {
    expect(checkCompatibility(FULL, MIN)).toEqual({ compatible: true });
    expect(checkCompatibility({ glLimit: 1_000_000, aggregateLimit: 2_000_000 }, MIN)).toEqual({ compatible: true });
  });

  it('treats a missing limit as zero', () => {
    expect(checkCompatibility({}, MIN)).toEqual({
      compatible: false,
      gaps: [
        'GL limit too low: org has $0, vendor requires $1,000,000',
        'Aggregate limit too low: org has $0, vendor requires $2,000,000',
      ],
    });
  });

  it('flags a GL limit one dollar short', () => {
    expect(checkCompatibility({ ...FULL, glLimit: 999_999 }, MIN)).toEqual({
      compatible: false,
      gaps: ['GL limit too low: org has $999,999, vendor requires $1,000,000'],
    });
  });

  it('flags an aggregate limit short on its own', () => {
    expect(checkCompatibility({ ...FULL, aggregateLimit: 1_500_000 }, MIN)).toEqual({
      compatible: false,
      gaps: ['Aggregate limit too low: org has $1,500,000, vendor requires $2,000,000'],
    });
  });

  it('requires workers comp only when the vendor asks and the org has none', () => {
    const wc = { ...MIN, workersCompRequired: true };
    expect(checkCompatibility(FULL, wc)).toEqual({ compatible: true });
    expect(checkCompatibility({ ...FULL, workersCompLimit: undefined }, wc)).toEqual({
      compatible: false,
      gaps: ['Vendor requires workers compensation coverage'],
    });
    expect(checkCompatibility({ ...FULL, workersCompLimit: 0 }, wc)).toEqual({
      compatible: false,
      gaps: ['Vendor requires workers compensation coverage'],
    });
    expect(checkCompatibility({ ...FULL, workersCompLimit: undefined }, MIN)).toEqual({ compatible: true });
  });

  it('requires the additional insured endorsement only when the vendor asks', () => {
    const ai = { ...MIN, additionalInsuredRequired: true };
    expect(checkCompatibility(FULL, ai)).toEqual({ compatible: true });
    expect(checkCompatibility({ ...FULL, additionalInsuredAvailable: false }, ai)).toEqual({
      compatible: false,
      gaps: ['Vendor requires additional insured endorsement'],
    });
    expect(checkCompatibility({ ...FULL, additionalInsuredAvailable: undefined }, ai).compatible).toBe(false);
    expect(checkCompatibility({ ...FULL, additionalInsuredAvailable: false }, MIN)).toEqual({ compatible: true });
  });

  it('lists every gap, in order, when everything is missing', () => {
    const strict = { ...MIN, workersCompRequired: true, additionalInsuredRequired: true };
    expect(checkCompatibility({}, strict)).toEqual({
      compatible: false,
      gaps: [
        'GL limit too low: org has $0, vendor requires $1,000,000',
        'Aggregate limit too low: org has $0, vendor requires $2,000,000',
        'Vendor requires workers compensation coverage',
        'Vendor requires additional insured endorsement',
      ],
    });
  });

  it('is compatible against a vendor with no minimums at all', () => {
    expect(checkCompatibility({}, { ...MIN, glLimit: 0, aggregateLimit: 0 })).toEqual({ compatible: true });
  });
});

describe('getVendorMinimums', () => {
  beforeEach(() => {
    db.reset();
    db.seed('vendor_insurance_minimums', [
      {
        vendor_id: 'omega',
        vendor_name: 'Omega Cinema Props',
        gl_limit: 1_000_000,
        aggregate_limit: 2_000_000,
        workers_comp_required: true,
        additional_insured_required: false,
        notes: 'Named insured must match the PO.',
      },
      {
        vendor_id: 'hpr',
        vendor_name: 'Hand Prop Room',
        gl_limit: 2_000_000,
        aggregate_limit: 4_000_000,
        workers_comp_required: false,
        additional_insured_required: true,
        notes: null,
      },
    ]);
  });

  it('short-circuits on an empty id list without touching the database', async () => {
    await expect(getVendorMinimums([])).resolves.toEqual({});
    expect(db.log).toEqual([]);
  });

  it('maps rows to the camelCase shape keyed by vendor id', async () => {
    await expect(getVendorMinimums(['omega', 'hpr'])).resolves.toEqual({
      omega: {
        vendorId: 'omega',
        vendorName: 'Omega Cinema Props',
        glLimit: 1_000_000,
        aggregateLimit: 2_000_000,
        workersCompRequired: true,
        additionalInsuredRequired: false,
        notes: 'Named insured must match the PO.',
      },
      hpr: {
        vendorId: 'hpr',
        vendorName: 'Hand Prop Room',
        glLimit: 2_000_000,
        aggregateLimit: 4_000_000,
        workersCompRequired: false,
        additionalInsuredRequired: true,
        notes: undefined,
      },
    });
  });

  it('returns only the vendors asked for and omits unknown ids', async () => {
    const out = await getVendorMinimums(['hpr', 'nobody']);
    expect(Object.keys(out)).toEqual(['hpr']);
  });

  it('is empty when a read fails rather than throwing', async () => {
    db.failNext('vendor_insurance_minimums', 'select', 'connection reset');
    await expect(getVendorMinimums(['omega'])).resolves.toEqual({});
  });
});
