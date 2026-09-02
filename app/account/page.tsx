/**
 * /account — the signed-in user's account dashboard.
 *
 * Surfaces what we hold on the user (profile + org) and a lifetime activity
 * band (orders placed, items rented, crew hired, COIs issued) so the account
 * icon leads somewhere that actually reflects the account, not just the
 * insurance sub-page.
 */

import Link from 'next/link';
import { requireOrgId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getJobsOverview } from '@/lib/jobs';
import { PageShell } from '@/components/ap/page-shell';
import type { Profession, PlanTier } from '@/lib/accounts';

export const metadata = { title: 'Account · Prop Haus' };

const PROFESSION_LABELS: Record<Profession, string> = {
  set_decorator: 'Set decorator',
  production_designer: 'Production designer',
  art_director: 'Art director',
  prop_master: 'Prop master',
  producer: 'Producer',
  stylist: 'Stylist',
  event_producer: 'Event producer',
  experiential_producer: 'Experiential producer',
  other: 'Other',
};

const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
};

type ProfileRow = {
  email: string;
  full_name: string | null;
  profession: string | null;
  created_at: string;
};

type OrgRow = {
  name: string;
  plan: string;
};

export default async function AccountPage() {
  const orgId = await requireOrgId('/account');
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileResult, orgResult, { jobs, crew, stats }] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name, profession, created_at')
      .eq('id', user?.id ?? '')
      .single(),
    supabase.from('organizations').select('name, plan').eq('id', orgId).single(),
    getJobsOverview(orgId),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  const org = orgResult.data as OrgRow | null;

  const itemsConfirmed = jobs.reduce(
    (n, job) => n + job.items.filter((i) => i.status === 'confirmed').length,
    0,
  );

  const activityTiles: Array<{ label: string; value: number }> = [
    { label: 'Orders placed', value: jobs.length },
    { label: 'Items rented', value: itemsConfirmed },
    { label: 'Crew hired', value: crew.length },
    { label: 'COIs issued', value: stats.coisIssued },
  ];

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Account
          </p>
          <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
            {profile?.full_name || profile?.email || 'Your account'}
          </h1>
        </div>

        {/* Profile + org */}
        <div className="grid grid-cols-1 gap-0 border-t border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div className="py-6 sm:pr-8">
            <SectionLabel>Profile</SectionLabel>
            <dl className="mt-3 space-y-3">
              <Field label="Email" value={profile?.email ?? user?.email ?? '—'} />
              <Field label="Name" value={profile?.full_name || '—'} />
              <Field
                label="Profession"
                value={
                  profile?.profession
                    ? (PROFESSION_LABELS[profile.profession as Profession] ?? profile.profession)
                    : '—'
                }
              />
              <Field label="Member since" value={profile?.created_at ? formatDate(profile.created_at) : '—'} />
            </dl>
          </div>

          <div className="py-6 sm:pl-8">
            <SectionLabel>Organization</SectionLabel>
            <dl className="mt-3 space-y-3">
              <Field label="Name" value={org?.name ?? '—'} />
              <Field label="Plan" value={org?.plan ? (PLAN_LABELS[org.plan as PlanTier] ?? org.plan) : '—'} />
            </dl>
            <Link
              href="/account/insurance"
              className="mt-5 inline-block font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-accent-text underline underline-offset-4"
            >
              Insurance & certificates →
            </Link>
          </div>
        </div>

        {/* Lifetime activity */}
        <section className="mt-12">
          <SectionLabel>Lifetime activity</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {activityTiles.map((t) => (
              <div key={t.label} className="bg-background px-4 py-5">
                <p className="font-mono text-[28px] font-medium leading-none tabular-nums text-foreground">
                  {t.value}
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase leading-[14px] tracking-[0.06em] text-text-tertiary">
                  {t.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Shortcut to jobs-in-progress */}
        <div className="mt-10">
          <Link
            href="/jobs"
            className="font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary underline underline-offset-4 hover:text-foreground"
          >
            View jobs in progress →
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
      {children}
    </h2>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">{label}</dt>
      <dd className="truncate text-right text-[14px] text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
