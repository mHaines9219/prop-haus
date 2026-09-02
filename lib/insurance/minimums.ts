/**
 * The org's insurance on file and each vendor's minimums.
 *
 * Prop Haus never issues, binds, or brokers coverage. The production's broker
 * does. This module holds the data the order pipeline reads from the profile
 * and compares against what a vendor's COI must show, so the outreach preview
 * can warn before the request goes out.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export type InsuranceProfile = {
  /** Policy number or reference from the production's carrier. */
  policyRef?: string;
  /** Named insured — usually the production company / org name. */
  namedInsured: string;
  /** General liability limit in dollars (e.g. 1_000_000). */
  glLimit: number;
  /** Aggregate limit in dollars (e.g. 2_000_000). */
  aggregateLimit: number;
  /** Workers comp limit, if applicable. */
  workersCompLimit?: number;
  /** Additional insured endorsement available? */
  additionalInsuredAvailable: boolean;
  /** ISO date string of policy expiry. */
  expiresAt?: string;
};

export type VendorInsuranceMinimum = {
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
 * Evaluate whether an org's insurance on file meets a vendor's minimums.
 * Returns compatible:true or a list of human-readable gaps.
 */
export function checkCompatibility(
  profile: InsuranceProfile,
  min: VendorInsuranceMinimum
): CompatibilityResult {
  const gaps: string[] = [];

  if (profile.glLimit < min.glLimit) {
    gaps.push(
      `GL limit too low: org has $${profile.glLimit.toLocaleString()}, vendor requires $${min.glLimit.toLocaleString()}`
    );
  }

  if (profile.aggregateLimit < min.aggregateLimit) {
    gaps.push(
      `Aggregate limit too low: org has $${profile.aggregateLimit.toLocaleString()}, vendor requires $${min.aggregateLimit.toLocaleString()}`
    );
  }

  if (min.workersCompRequired && !profile.workersCompLimit) {
    gaps.push('Vendor requires workers compensation coverage');
  }

  if (min.additionalInsuredRequired && !profile.additionalInsuredAvailable) {
    gaps.push('Vendor requires additional insured endorsement');
  }

  if (gaps.length > 0) return { compatible: false, gaps };
  return { compatible: true };
}

type MinimumRow = {
  vendor_id: string;
  vendor_name: string;
  gl_limit: number;
  aggregate_limit: number;
  workers_comp_required: boolean;
  additional_insured_required: boolean;
  notes: string | null;
};

/** The minimums on file for a set of vendors, keyed by vendor id. */
export async function getVendorMinimums(
  vendorIds: string[]
): Promise<Record<string, VendorInsuranceMinimum>> {
  if (vendorIds.length === 0) return {};
  const db = createAdminClient();
  const { data } = await db
    .from('vendor_insurance_minimums')
    .select('vendor_id, vendor_name, gl_limit, aggregate_limit, workers_comp_required, additional_insured_required, notes')
    .in('vendor_id', vendorIds);

  return Object.fromEntries(
    ((data ?? []) as MinimumRow[]).map((r) => [
      r.vendor_id,
      {
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        glLimit: r.gl_limit,
        aggregateLimit: r.aggregate_limit,
        workersCompRequired: r.workers_comp_required,
        additionalInsuredRequired: r.additional_insured_required,
        notes: r.notes ?? undefined,
      },
    ])
  );
}
