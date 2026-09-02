/**
 * /account/insurance — the org's insurance on file.
 *
 * The production's broker issues coverage. Prop Haus stores these details to
 * write vendor requests and fill vendor forms. Copy must never claim Prop Haus
 * is the insurer or broker.
 */

import { requireOrgId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { InsuranceProfileForm } from './insurance-profile-form';
import type { InsuranceProfile } from '@/lib/insurance/minimums';

export const metadata = { title: 'Insurance · Prop Haus' };

export default async function InsurancePage() {
  const orgId = await requireOrgId('/account/insurance');

  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, insurance_profile')
    .eq('id', orgId)
    .single();

  const insuranceProfile = (org?.insurance_profile ?? null) as InsuranceProfile | null;

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">

          {/* Page header */}
          <div className="border-b border-border py-10">
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Account
            </p>
            <h1 className="mt-3 font-display text-[32px] font-bold leading-[1.1] tracking-[-0.01em]">
              Insurance on file
            </h1>
            <p className="mt-2 max-w-[560px] font-sans text-[14px] leading-[22px] text-text-secondary">
              Your production&rsquo;s coverage, as your broker issued it. Vendor requests and forms
              are filled from what you enter here.
            </p>
          </div>

          <div className="max-w-[720px] py-10">
            <h2 className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Coverage
            </h2>
            <InsuranceProfileForm
              orgId={orgId}
              orgName={org?.name ?? ''}
              initialProfile={insuranceProfile}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
