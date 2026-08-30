/**
 * Post-checkout COI hook — called by the checkout route (MVP-3) after an order
 * is placed. Issues certificates for each vendor in the order.
 *
 * This is the extension point described in MVP-3's brief. To wire it in:
 *   1. Import `triggerCoiIssuance` in `app/api/checkout/route.ts`.
 *   2. Call it after the order transaction commits (fire-and-forget is fine —
 *      certificate status is tracked in the `certificates` table).
 *
 * Example (in checkout route):
 *   import { triggerCoiIssuance } from '@/lib/coi/post-checkout';
 *   // after order creation:
 *   triggerCoiIssuance({ orgId, orderId, vendorIds, rentalStartDate, rentalEndDate }).catch(console.error);
 */

import { createClient } from '@/lib/supabase/server';
import { getCoiProvider } from './provider';
import { checkCompatibility, type VendorCoiRequirement } from './requirements';
import type { InsuranceProfile } from './provider';

export type CoiTriggerInput = {
  orgId: string;
  orderId: string;
  /** Source vendor IDs from the order's cart lines. */
  vendorIds: string[];
  rentalStartDate?: string;
  rentalEndDate?: string;
};

export async function triggerCoiIssuance(input: CoiTriggerInput): Promise<void> {
  const { orgId, orderId, vendorIds, rentalStartDate, rentalEndDate } = input;

  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, insurance_profile')
    .eq('id', orgId)
    .single();

  if (!org?.insurance_profile) return; // No profile on file — skip silently

  const insuranceProfile = org.insurance_profile as InsuranceProfile;

  const { data: requirements } = await supabase
    .from('vendor_coi_requirements')
    .select('*')
    .in('vendor_id', vendorIds);

  const reqMap = Object.fromEntries(
    (requirements ?? []).map((r) => [r.vendor_id, r])
  );

  const provider = getCoiProvider();
  await provider.getOrCreatePolicy(orgId, insuranceProfile);

  await Promise.allSettled(
    vendorIds.map(async (vendorId) => {
      const req = reqMap[vendorId] as VendorCoiRequirement | undefined;

      if (!req) {
        await supabase.from('certificates').insert({
          org_id: orgId,
          order_id: orderId,
          vendor_id: vendorId,
          vendor_name: vendorId,
          status: 'pending',
          coverage_snapshot: {},
          error_message: 'Vendor requirements not on file — ops will follow up',
        });
        return;
      }

      const compat = checkCompatibility(insuranceProfile, req);

      if (!compat.compatible) {
        await supabase.from('certificates').insert({
          org_id: orgId,
          order_id: orderId,
          vendor_id: vendorId,
          vendor_name: req.vendorName,
          status: 'failed',
          coverage_snapshot: {},
          error_message: `Coverage gaps: ${compat.gaps.join('; ')}`,
        });
        return;
      }

      try {
        const issued = await provider.issueCertificate({
          orgId,
          orgName: org.name,
          insuranceProfile,
          vendorId,
          vendorName: req.vendorName,
          requirements: {
            glLimit: req.glLimit,
            aggregateLimit: req.aggregateLimit,
            workersCompRequired: req.workersCompRequired,
            additionalInsuredRequired: req.additionalInsuredRequired,
          },
          rentalStartDate,
          rentalEndDate,
          orderId,
        });

        await supabase.from('certificates').insert({
          org_id: orgId,
          order_id: orderId,
          vendor_id: vendorId,
          vendor_name: req.vendorName,
          external_id: issued.externalId,
          status: 'issued',
          coverage_snapshot: issued.coverageSummary,
          document_url: issued.documentUrl,
          effective_date: issued.effectiveDate,
          expiry_date: issued.expiryDate,
        });
      } catch (err) {
        await supabase.from('certificates').insert({
          org_id: orgId,
          order_id: orderId,
          vendor_id: vendorId,
          vendor_name: req.vendorName,
          status: 'failed',
          coverage_snapshot: {},
          error_message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })
  );
}
