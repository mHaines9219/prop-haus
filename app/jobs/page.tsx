/**
 * /jobs — the jobs-in-progress dashboard (MVP-8).
 *
 * One surface showing everything a signed-in user has in flight: orders moving
 * through vendor confirmation and crew requests. A "job" here IS an order,
 * enriched (see lib/jobs.ts). List view only, never a card grid (DESIGN.md
 * §9.7); the tables themselves live in jobs-board.tsx on the shared DataTable.
 */

import Link from 'next/link';
import { requireOrgId } from '@/lib/session';
import { getJobsOverview, type JobsStats } from '@/lib/jobs';
import { PageShell } from '@/components/ap/page-shell';
import { CrewTable, JobsTable } from './jobs-board';
import { toJobRow } from './rows';

export const metadata = { title: 'Jobs · Prop Haus' };

export default async function JobsPage() {
  const orgId = await requireOrgId('/jobs');
  const { jobs, crew, stats } = await getJobsOverview(orgId);

  const hasWork = jobs.length > 0 || crew.length > 0;
  const rows = jobs.map(toJobRow);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Production workflow
          </p>
          <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
            Jobs in progress
          </h1>
        </div>

        {!hasWork ? (
          <EmptyState />
        ) : (
          <>
            <StatBand stats={stats} />

            {rows.length > 0 && (
              <section className="mt-12">
                <SectionLabel>In flight</SectionLabel>
                <JobsTable jobs={rows} />
              </section>
            )}

            {crew.length > 0 && (
              <section className="mt-12">
                <SectionLabel>Crew</SectionLabel>
                <CrewTable crew={crew} />
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
      {children}
    </h2>
  );
}

function StatBand({ stats }: { stats: JobsStats }) {
  const tiles: Array<{ label: string; value: number }> = [
    { label: 'Orders in flight', value: stats.ordersInFlight },
    { label: 'Items pending', value: stats.itemsPending },
    { label: 'Items quoted', value: stats.itemsQuoted },
    { label: 'Items confirmed', value: stats.itemsConfirmed },
    { label: 'Crew pending', value: stats.crewPending },
    { label: 'Vendors notified', value: stats.vendorsNotified },
    { label: 'To sign', value: stats.documentsPending },
  ];

  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
      {tiles.map((t) => (
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
  );
}

function EmptyState() {
  return (
    <div className="border-t border-border py-16">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        Nothing in flight
      </p>
      <p className="mt-3 max-w-[420px] text-[15px] leading-[23px] text-text-secondary">
        Build a cart and place an order to start tracking vendor confirmations and crew here.
      </p>
      <Link
        href="/search"
        className="mt-6 inline-block rounded-md border border-accent px-5 py-2.5 font-mono text-[13px] font-medium text-accent-text transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        Browse catalog
      </Link>
    </div>
  );
}
