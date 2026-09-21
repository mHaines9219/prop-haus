import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { currentOrgId } from '@/lib/session';
import { listProjectSummaries, type ProjectSummary } from '@/lib/projects';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { CrewDirectory } from '@/components/crew/crew-directory';
import type { Contractor } from '@/components/crew/contractor-card';
import { JoinRoster } from '@/components/crew/join-roster';
import { CREW_CATEGORY, CREW_COPY, isCrewRoleSlug } from '@/lib/crew';

export const metadata = {
  title: 'Crew — Prop Haus',
  description:
    'Hire production assistants and delivery drivers for set days, load-in and load-out, and same-day runs.',
};

async function getContractors(): Promise<Contractor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contractors')
    .select('id, name, photo, skills, city, rate_low, rate_high, bio, category')
    .eq('active', true)
    .eq('category', CREW_CATEGORY)
    .order('name');
  return (data as Contractor[]) ?? [];
}

/**
 * The signed-in org's projects, for the request form's project picker. Anonymous
 * visitors browse without one; a failed read leaves the picker out rather than
 * failing the page.
 */
async function getProjects(): Promise<ProjectSummary[]> {
  const orgId = await currentOrgId();
  if (!orgId) return [];
  return listProjectSummaries(orgId).catch(() => []);
}

/**
 * /crew?project=<id> — arrived from a project's "Need a crew?" button: the
 * request form starts on that project and a strip up top says so. An id that
 * is not one of the org's own projects is ignored.
 */
export default async function CrewPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[]; project?: string | string[] }>;
}) {
  const { role, project } = await searchParams;
  const initialRole = isCrewRoleSlug(role) ? role : null;
  const [contractors, projects] = await Promise.all([getContractors(), getProjects()]);
  const hiringFor = typeof project === 'string' ? (projects.find((p) => p.id === project) ?? null) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />

      <main className="flex-1">
        {/* Header */}
        <section>
          <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-16 sm:px-6 md:pt-24">
            {hiringFor && (
              <Link
                href={`/projects/${hiringFor.id}`}
                className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors duration-150 hover:text-foreground"
              >
                <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
                {hiringFor.name}
              </Link>
            )}
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              {hiringFor ? `Hiring for ${hiringFor.name}` : CREW_COPY.eyebrow}
            </p>
            <h1 className="mt-5 max-w-[640px] font-display text-[40px] font-bold leading-[1.06] tracking-[-0.01em] [text-wrap:balance] md:text-[56px] md:leading-[60px]">
              {CREW_COPY.headline}
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-[23px] text-text-secondary">
              {CREW_COPY.blurb}
            </p>
          </div>
        </section>

        {/* Filter rail + ruled grid */}
        <CrewDirectory
          contractors={contractors}
          initialRole={initialRole}
          projects={projects}
          initialProjectId={hiringFor?.id ?? null}
        />

        {/* Contractor-facing: get listed on the roster */}
        <section className="border-t border-border">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                {CREW_COPY.joinEyebrow}
              </p>
              <p className="mt-3 max-w-[480px] text-[15px] leading-[23px] text-text-secondary">
                {CREW_COPY.joinBlurb}
              </p>
            </div>
            <JoinRoster />
          </div>
        </section>

        {/* Footer note */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6">
            <p className="font-mono text-[11px] uppercase leading-[14px] tracking-[0.08em] text-text-disabled">
              {CREW_COPY.footerNote}
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
