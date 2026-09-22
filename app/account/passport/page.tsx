/**
 * /account/passport — the documents a production hands over on every rental,
 * kept once. Checkout and vendor paperwork attach from here so nothing is
 * asked twice. The COI row reads through to the order profile.
 */

import Link from 'next/link';
import { passportSummary } from '@/lib/passport';
import { getPassport } from '@/lib/passport-store';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { PassportWallet } from './passport-wallet';

export const metadata = { title: 'Passport · Prop Haus' };

export default async function PassportPage() {
  const orgId = await requireOrgId('/account/passport');
  const passport = await getPassport(orgId);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">
        <div className="mb-10">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Account
          </p>
          <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
            Passport
          </h1>
          <p className="mt-2 max-w-[560px] text-[14px] leading-[22px] text-text-secondary">
            The documents vendors ask for on every rental, uploaded once. Checkout attaches them to
            your requests and forms so you are never asked twice. Company details live on the{' '}
            <Link href="/account/profile" className="underline underline-offset-4">
              order profile
            </Link>
            .
          </p>
        </div>

        <PassportWallet initialPassport={passport} initialSummary={passportSummary(passport)} />
      </div>
    </PageShell>
  );
}
