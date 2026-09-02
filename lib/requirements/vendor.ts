/**
 * Vendor-specific paperwork requirements, in the shape the engine reads.
 *
 * Source today: the per-vendor form rows MVP-12 already keeps (vendor_forms)
 * and each vendor's insurance minimums. A vendor's COI request becomes "COI,
 * required by Omega"; a W-9 request becomes "W-9, required by Prop Heaven".
 * Nothing here is new data; it is the existing data read for a project
 * instead of an order.
 *
 * The pure mapping is exported for tests; loadVendorRequirements does the reads.
 */

import type { Source } from '../types';
import { SOURCE_META } from '../types';
import { listVendorForms, type VendorForm } from '../forms/packet';
import { getVendorMinimums, type VendorInsuranceMinimum } from '../insurance/minimums';

export type VendorRequirement = {
  vendorId: string;
  vendorName: string;
  /** A lib/requirements/library.ts id. */
  requirementId: string;
  reason: string;
};

const FORM_KIND_TO_REQUIREMENT: Record<string, string> = {
  coi_request: 'certificate_of_insurance',
  w9_request: 'w9',
  rental_agreement: 'vendor_rental_agreement',
  credit_application: 'vendor_account_application',
  new_account: 'vendor_account_application',
};

export function vendorDisplayName(vendorId: string): string {
  return SOURCE_META[vendorId as Source]?.name ?? vendorId;
}

export function fromVendorForm(form: Pick<VendorForm, 'vendorId' | 'kind' | 'label'>): VendorRequirement | null {
  const requirementId = FORM_KIND_TO_REQUIREMENT[form.kind];
  if (!requirementId) return null;
  const vendorName = vendorDisplayName(form.vendorId);
  return {
    vendorId: form.vendorId,
    vendorName,
    requirementId,
    reason: `${vendorName} asks new customers for a ${form.label.toLowerCase()}.`,
  };
}

export function fromInsuranceMinimum(min: VendorInsuranceMinimum): VendorRequirement {
  const parts = [`general liability of $${min.glLimit.toLocaleString()}`];
  if (min.additionalInsuredRequired) parts.push('additional insured status');
  if (min.workersCompRequired) parts.push('workers compensation');
  return {
    vendorId: min.vendorId,
    vendorName: min.vendorName || vendorDisplayName(min.vendorId),
    requirementId: 'certificate_of_insurance',
    reason: `${min.vendorName || vendorDisplayName(min.vendorId)} requires a certificate showing ${parts.join(', ')}.`,
  };
}

/** One requirement per (vendor, requirement); a vendor with both a COI form and minimums lists once. */
export function dedupe(list: VendorRequirement[]): VendorRequirement[] {
  const seen = new Set<string>();
  return list.filter((v) => {
    const key = `${v.vendorId}:${v.requirementId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type VendorPaperwork = {
  requirements: VendorRequirement[];
  minimums: Record<string, VendorInsuranceMinimum>;
};

/** Everything the given vendors ask of a new customer, plus their raw insurance minimums for the gap check. */
export async function loadVendorPaperwork(vendorIds: string[]): Promise<VendorPaperwork> {
  if (vendorIds.length === 0) return { requirements: [], minimums: {} };
  const [forms, minimums] = await Promise.all([listVendorForms(vendorIds), getVendorMinimums(vendorIds)]);
  const fromMinimums = Object.values(minimums).map(fromInsuranceMinimum);
  const fromForms = forms.map(fromVendorForm).filter((v): v is VendorRequirement => v !== null);
  return { requirements: dedupe([...fromMinimums, ...fromForms]), minimums };
}
