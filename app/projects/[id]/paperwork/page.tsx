import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireOrgId, currentPlan } from '@/lib/session';
import { buildChecklist } from '@/lib/requirements/store';
import { intakeProvider } from '@/lib/intake/extract';
import { PageShell } from '@/components/ap/page-shell';
import { ProfileForm } from './profile-form';
import { ChecklistSection } from './checklist';

/**
 * /projects/[id]/paperwork — the paperwork workspace for one production.
 * Left: the production form, seeded by a one-line description. Right: the
 * checklist the requirements engine derives from that profile, with the
 * reason behind every row and the action that closes it.
 */
export default async function PaperworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId(`/projects/${id}/paperwork`);
  const plan = await currentPlan();

  const built = await buildChecklist(orgId, id, plan);
  if (!built) notFound();
  const { project, checklist } = built;
  const { total, complete, needsInformation } = checklist.summary;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          {project.name}
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Paperwork
            </p>
            <h1 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
              {project.name}
            </h1>
            <p className="mt-1 font-mono text-[13px] leading-[18px] text-text-tertiary">
              {total === 0
                ? 'No checklist yet'
                : `${complete} of ${total} complete${needsInformation > 0 ? ` · ${needsInformation} need${needsInformation === 1 ? 's' : ''} information` : ''}`}
            </p>
          </div>
          {/* Skip: nothing below is required. The checklist already stands on
              the defaults, so skipping is just leaving for the project page. */}
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex h-8 items-center rounded-[2px] bg-primary px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-primary-foreground transition-colors duration-150 hover:bg-primary-hover"
            >
              Skip for now
            </Link>
            <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              Use the defaults and go to the project. You can come back any time.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <ProfileForm projectId={project.id} initialProfile={project.profile} provider={intakeProvider()} />
          </div>
          <div className="lg:col-span-7">
            <ChecklistSection projectId={project.id} checklist={checklist} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
