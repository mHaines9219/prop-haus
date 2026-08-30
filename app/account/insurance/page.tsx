/**
 * /account/insurance — org insurance profile and certificate ledger.
 *
 * The COI PARTNER issues coverage. Prop Haus is the workflow layer.
 * Copy must never claim Prop Haus is the insurer or broker.
 */

import { requireOrgId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { InsuranceProfileForm } from './insurance-profile-form';
import { CertificateLedger } from './certificate-ledger';
import type { InsuranceProfile } from '@/lib/coi/provider';

export const metadata = { title: 'Insurance · Prop Haus' };

export default async function InsurancePage() {
  const orgId = await requireOrgId('/account/insurance');

  const supabase = await createClient();

  const [orgResult, certsResult] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, insurance_profile')
      .eq('id', orgId)
      .single(),
    supabase
      .from('certificates')
      .select('id, vendor_id, vendor_name, external_id, status, coverage_snapshot, document_url, effective_date, expiry_date, error_message, created_at, order_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const org = orgResult.data;
  const certificates = certsResult.data ?? [];
  const insuranceProfile = (org?.insurance_profile ?? null) as InsuranceProfile | null;

  return (
    <div data-theme="answer-print" className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">

          {/* Page header */}
          <div className="border-b border-border py-10">
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Account
            </p>
            <h1 className="mt-3 font-display text-[32px] font-bold leading-[1.1] tracking-[-0.01em] [font-stretch:125%]">
              Insurance
            </h1>
            <p className="mt-2 max-w-[560px] font-sans text-[14px] leading-[22px] text-text-secondary">
              Store your coverage details. COIs are issued by our licensed insurance partner — not by Prop Haus.
              Certificates are generated per-vendor at checkout.
            </p>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_1fr] lg:divide-x lg:divide-border">

            {/* Left: coverage profile */}
            <div className="py-10 lg:pr-10">
              <h2 className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                Coverage profile
              </h2>
              <InsuranceProfileForm
                orgId={orgId}
                orgName={org?.name ?? ''}
                initialProfile={insuranceProfile}
              />
            </div>

            {/* Right: certificate ledger */}
            <div className="py-10 lg:pl-10">
              <h2 className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                Certificates
              </h2>
              <CertificateLedger certificates={certificates} />
            </div>

          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
