/**
 * /account/profile — the org's order profile: everything a one-click order
 * needs, entered once. Company, contacts, delivery defaults, the production's
 * own insurance on file, and the authorization that lets Prop Haus complete
 * vendor forms with it. Copy never claims Prop Haus is an insurer or broker.
 */

import { orderReadiness } from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { OrderProfileForm } from './order-profile-form';

export const metadata = { title: 'Order profile · Prop Haus' };

export default async function OrderProfilePage() {
  const orgId = await requireOrgId('/account/profile');
  const profile = await getOrderProfile(orgId);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">
        <div className="mb-10">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Account
          </p>
          <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
            Order profile
          </h1>
          <p className="mt-2 max-w-[560px] text-[14px] leading-[22px] text-text-secondary">
            Everything an order needs, entered once. Checkout is one click because it reads from
            here; vendor emails and forms are filled from your profile, and you sign.
          </p>
        </div>

        <OrderProfileForm initialProfile={profile} initialReadiness={orderReadiness(profile)} />
      </div>
    </PageShell>
  );
}
