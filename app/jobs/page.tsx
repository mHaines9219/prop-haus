/**
 * /jobs — the jobs-in-progress dashboard (MVP-8).
 *
 * One surface showing everything a signed-in user has in flight: orders moving
 * through vendor confirmation and crew requests. A "job" here IS an order,
 * enriched (see lib/jobs.ts). List view only,
 * never a card grid (DESIGN.md §9.7).
 */

import Link from 'next/link';
import { requireOrgId } from '@/lib/session';
import { getJobsOverview, jobRollupCopy, type Job, type CrewRequestRow } from '@/lib/jobs';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import {
  StatusToken,
  orderStatusSpec,
  crewStatusSpec,
} from '@/components/ap/status-token';

export const metadata = { title: 'Jobs · Prop Haus' };

export default async function JobsPage() {
  const orgId = await requireOrgId('/jobs');
  const { jobs, crew, stats } = await getJobsOverview(orgId);

  const hasWork = jobs.length > 0 || crew.length > 0;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">
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

            {/* In flight */}
            {jobs.length > 0 && (
              <section className="mt-12">
                <SectionLabel>In flight</SectionLabel>
                <div className="border-t border-border">
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {/* Crew */}
            {crew.length > 0 && (
              <section className="mt-12">
                <SectionLabel>Crew</SectionLabel>
                <div className="border-t border-border">
                  {crew.map((req) => (
                    <CrewRow key={req.id} req={req} />
                  ))}
                </div>
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
    <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
      {children}
    </h2>
  );
}

function StatBand({ stats }: { stats: Awaited<ReturnType<typeof getJobsOverview>>['stats'] }) {
  const tiles: Array<{ label: string; value: number }> = [
    { label: 'Orders in flight', value: stats.ordersInFlight },
    { label: 'Items pending', value: stats.itemsPending },
    { label: 'Items quoted', value: stats.itemsQuoted },
    { label: 'Items confirmed', value: stats.itemsConfirmed },
    { label: 'Crew pending', value: stats.crewPending },
    { label: 'Vendors notified', value: stats.vendorsNotified },
  ];

  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
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

function JobRow({ job }: { job: Job }) {
  const thumbs = job.items.filter((i) => i.image).slice(0, 3);
  const updated = formatDate(job.updatedAt);

  return (
    <Link
      href={`/orders/${job.id}`}
      className="flex items-center gap-4 border-b border-border py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-colors hover:bg-surface-raised"
    >
      {/* Overlapping mini LightWells */}
      <div className="flex shrink-0 items-center">
        {thumbs.length > 0 ? (
          thumbs.map((item, i) => (
            <div
              key={item.id}
              className="h-11 w-11 overflow-hidden rounded-md"
              style={{ marginLeft: i === 0 ? 0 : -12, zIndex: thumbs.length - i }}
            >
              <LightWell src={item.image} alt={item.name} mode="photo" fill />
            </div>
          ))
        ) : (
          <div className="h-11 w-11 rounded-md border border-border bg-plate" />
        )}
      </div>

      {/* Copy */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="font-medium leading-snug">Order #{job.id.slice(0, 8).toUpperCase()}</p>
          <StatusToken {...orderStatusSpec(job.status)} />
        </div>
        <p className="mt-1 font-mono text-[12px] text-text-tertiary">{jobRollupCopy(job)}</p>
      </div>

      {/* Right meta */}
      <div className="hidden shrink-0 text-right sm:block">
        <p className="font-mono text-[12px] tabular-nums text-text-secondary">
          {job.items.length} item{job.items.length !== 1 ? 's' : ''}
        </p>
        <p className="mt-1 font-mono text-[11px] tabular-nums text-text-tertiary">{updated}</p>
      </div>
    </Link>
  );
}

function CrewRow({ req }: { req: CrewRequestRow }) {
  const dates =
    req.requestedDates.length > 0
      ? req.requestedDates.map(formatDate).join(', ')
      : 'Dates on request';

  return (
    <div className="flex items-center gap-4 border-b border-border py-3">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md">
        <LightWell src={req.contractorPhoto ?? undefined} alt={req.contractorName} mode="photo" fill name={req.contractorName} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="font-medium leading-snug">{req.contractorName}</p>
          <StatusToken {...crewStatusSpec(req.status)} />
        </div>
        <p className="mt-1 font-mono text-[12px] text-text-tertiary">
          {dates}
          {req.location ? ` · ${req.location}` : ''}
        </p>
      </div>
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
