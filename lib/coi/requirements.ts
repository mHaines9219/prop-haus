/**
 * Per-vendor COI requirements and compatibility evaluation.
 *
 * Requirements are stored as data (seeded into the DB) so ops can edit them
 * without a deployment. This module also provides the seeding constants and
 * the in-app compatibility check used before issuance.
 */

import type { InsuranceProfile } from './provider';

export type VendorCoiRequirement = {
  vendorId: string;
  vendorName: string;
  /** Minimum GL per-occurrence limit in dollars. */
  glLimit: number;
  /** Minimum aggregate limit in dollars. */
  aggregateLimit: number;
  /** Whether workers comp coverage is required. */
  workersCompRequired: boolean;
  /** Whether the vendor must be named as additional insured. */
  additionalInsuredRequired: boolean;
  /** Free-text notes for the ops team or user. */
  notes?: string;
};

export type CompatibilityResult =
  | { compatible: true }
  | { compatible: false; gaps: string[] };

/**
 * Evaluate whether an org's insurance profile meets a vendor's requirements.
 * Returns compatible:true or a list of human-readable gaps.
 */
export function checkCompatibility(
  profile: InsuranceProfile,
  req: VendorCoiRequirement
): CompatibilityResult {
  const gaps: string[] = [];

  if (profile.glLimit < req.glLimit) {
    gaps.push(
      `GL limit too low: org has $${profile.glLimit.toLocaleString()}, vendor requires $${req.glLimit.toLocaleString()}`
    );
  }

  if (profile.aggregateLimit < req.aggregateLimit) {
    gaps.push(
      `Aggregate limit too low: org has $${profile.aggregateLimit.toLocaleString()}, vendor requires $${req.aggregateLimit.toLocaleString()}`
    );
  }

  if (req.workersCompRequired && !profile.workersCompLimit) {
    gaps.push('Vendor requires workers compensation coverage');
  }

  if (req.additionalInsuredRequired && !profile.additionalInsuredAvailable) {
    gaps.push('Vendor requires additional insured endorsement');
  }

  if (gaps.length > 0) return { compatible: false, gaps };
  return { compatible: true };
}

// ---------------------------------------------------------------------------
// Seed data — PLACEHOLDER values based on common LA prop house requirements.
// Replace with real requirements obtained from each vendor.
// ---------------------------------------------------------------------------

// PLACEHOLDER: these are representative industry-standard minimums.
// Verify actual requirements with each vendor before going live.
export const VENDOR_COI_REQUIREMENTS: Record<string, VendorCoiRequirement> = {
  gilandroy: {
    vendorId: 'gilandroy',
    vendorName: 'Gil & Roy Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  hpr: {
    vendorId: 'hpr',
    vendorName: 'Hand Prop Room',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: true,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: full-service house; weapons inventory may require higher limits',
  },
  platinum: {
    vendorId: 'platinum',
    vendorName: 'Platinum Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  omega: {
    vendorId: 'omega',
    vendorName: 'Omega Cinema Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: large studio; may require higher limits for full pulls',
  },
  ec: {
    vendorId: 'ec',
    vendorName: 'Eclectic Encore Prop',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  heritage: {
    vendorId: 'heritage',
    vendorName: 'Heritage Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  propheaven: {
    vendorId: 'propheaven',
    vendorName: 'Prop Heaven',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  universal: {
    vendorId: 'universal',
    vendorName: 'Universal Studios Property',
    glLimit: 2_000_000,
    aggregateLimit: 4_000_000,
    workersCompRequired: true,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: studio-owned; typically requires higher limits than independent houses',
  },
  warnerbros: {
    vendorId: 'warnerbros',
    vendorName: 'Warner Bros. Studio Props',
    glLimit: 2_000_000,
    aggregateLimit: 4_000_000,
    workersCompRequired: true,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: studio-owned; typically requires higher limits than independent houses',
  },
  propserviceswest: {
    vendorId: 'propserviceswest',
    vendorName: 'Prop Services West',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  pina: {
    vendorId: 'pina',
    vendorName: 'Pina Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  objects: {
    vendorId: 'objects',
    vendorName: 'Objects',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  alleycats: {
    vendorId: 'alleycats',
    vendorName: 'Alley Cat Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  alpha: {
    vendorId: 'alpha',
    vendorName: 'Alpha Companies',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  depict33: {
    vendorId: 'depict33',
    vendorName: 'Depict 33',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  iss: {
    vendorId: 'iss',
    vendorName: 'ISS Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
  premiere: {
    vendorId: 'premiere',
    vendorName: 'Premiere Props',
    glLimit: 1_000_000,
    aggregateLimit: 2_000_000,
    workersCompRequired: false,
    additionalInsuredRequired: true,
    notes: 'PLACEHOLDER: verify with vendor',
  },
};
