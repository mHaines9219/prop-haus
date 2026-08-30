/**
 * POST /api/coi — request COI issuance for one or more vendors.
 *
 * Body: { vendorIds: string[], orderId?: string, rentalStartDate?: string, rentalEndDate?: string }
 *
 * Returns: { results: Array<{ vendorId, certificateId, status, message? }> }
 *
 * Auth required. The COI partner (not Prop Haus) underwrites and issues coverage.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { currentOrgId } from '@/lib/session';
import { getCoiProvider, type InsuranceProfile } from '@/lib/coi/provider';
import { checkCompatibility } from '@/lib/coi/requirements';

type RequestBody = {
  vendorIds: string[];
  orderId?: string;
  rentalStartDate?: string;
  rentalEndDate?: string;
};

export async function POST(req: Request) {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  const { vendorIds, orderId, rentalStartDate, rentalEndDate } = body;

  if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
    return NextResponse.json({ error: 'vendorIds is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch org details and insurance profile
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, insurance_profile')
    .eq('id', orgId)
    .single();

  if (orgErr || !org) {
    return NextResponse.json({ error: 'org not found' }, { status: 404 });
  }

  const insuranceProfile = org.insurance_profile as InsuranceProfile | null;
  if (!insuranceProfile) {
    return NextResponse.json(
      { error: 'No insurance profile on file. Add your coverage details before requesting COIs.' },
      { status: 422 }
    );
  }

  // Fetch vendor requirements for the requested vendors
  const { data: requirements } = await supabase
    .from('vendor_coi_requirements')
    .select('*')
    .in('vendor_id', vendorIds);

  const requirementsByVendor = Object.fromEntries(
    (requirements ?? []).map((r) => [r.vendor_id, r])
  );

  const provider = getCoiProvider();

  // Ensure the org has a policy (idempotent)
  await provider.getOrCreatePolicy(orgId, insuranceProfile);

  const results = await Promise.all(
    vendorIds.map(async (vendorId) => {
      const req_data = requirementsByVendor[vendorId];
      if (!req_data) {
        // Create a pending certificate record — requirements not yet on file
        const { data: cert } = await supabase
          .from('certificates')
          .insert({
            org_id: orgId,
            order_id: orderId ?? null,
            vendor_id: vendorId,
            vendor_name: vendorId,
            status: 'pending',
            coverage_snapshot: {},
            error_message: 'Vendor COI requirements not on file — ops will follow up',
          })
          .select('id')
          .single();

        return {
          vendorId,
          certificateId: cert?.id ?? null,
          status: 'pending',
          message: 'Requirements not on file — ops will follow up',
        };
      }

      // Evaluate compatibility
      const compat = checkCompatibility(insuranceProfile, {
        vendorId: req_data.vendor_id,
        vendorName: req_data.vendor_name,
        glLimit: req_data.gl_limit,
        aggregateLimit: req_data.aggregate_limit,
        workersCompRequired: req_data.workers_comp_required,
        additionalInsuredRequired: req_data.additional_insured_required,
      });

      if (!compat.compatible) {
        const { data: cert } = await supabase
          .from('certificates')
          .insert({
            org_id: orgId,
            order_id: orderId ?? null,
            vendor_id: vendorId,
            vendor_name: req_data.vendor_name,
            status: 'failed',
            coverage_snapshot: {},
            error_message: `Coverage gaps: ${compat.gaps.join('; ')}`,
          })
          .select('id')
          .single();

        return {
          vendorId,
          certificateId: cert?.id ?? null,
          status: 'failed',
          message: `Coverage insufficient: ${compat.gaps.join('; ')}`,
        };
      }

      // Issue via provider
      try {
        const issued = await provider.issueCertificate({
          orgId,
          orgName: org.name,
          insuranceProfile,
          vendorId,
          vendorName: req_data.vendor_name,
          requirements: {
            glLimit: req_data.gl_limit,
            aggregateLimit: req_data.aggregate_limit,
            workersCompRequired: req_data.workers_comp_required,
            additionalInsuredRequired: req_data.additional_insured_required,
          },
          rentalStartDate,
          rentalEndDate,
          orderId,
        });

        const { data: cert } = await supabase
          .from('certificates')
          .insert({
            org_id: orgId,
            order_id: orderId ?? null,
            vendor_id: vendorId,
            vendor_name: req_data.vendor_name,
            external_id: issued.externalId,
            status: 'issued',
            coverage_snapshot: issued.coverageSummary,
            document_url: issued.documentUrl,
            effective_date: issued.effectiveDate,
            expiry_date: issued.expiryDate,
          })
          .select('id')
          .single();

        return {
          vendorId,
          certificateId: cert?.id ?? null,
          externalId: issued.externalId,
          documentUrl: issued.documentUrl,
          status: 'issued',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown provider error';

        const { data: cert } = await supabase
          .from('certificates')
          .insert({
            org_id: orgId,
            order_id: orderId ?? null,
            vendor_id: vendorId,
            vendor_name: req_data.vendor_name,
            status: 'failed',
            coverage_snapshot: {},
            error_message: msg,
          })
          .select('id')
          .single();

        return {
          vendorId,
          certificateId: cert?.id ?? null,
          status: 'failed',
          message: msg,
        };
      }
    })
  );

  return NextResponse.json({ results });
}
