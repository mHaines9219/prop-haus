import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ClipboardList, FileText } from 'lucide-react';
import {
  getProject,
  paperworkFolder,
  projectDocumentCount,
  projectItemCount,
  sceneFolders,
  type ProjectFolder,
} from '@/lib/projects';
import { getProjectJobs, type JobsStats } from '@/lib/jobs';
import { evaluate } from '@/lib/requirements/evaluate';
import { requireOrgId } from '@/lib/session';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import { CrewList } from './crew-list';
import { FolderActions } from './folder-actions';
import { toJobRow } from './job-rows';
import { JobsTable } from './jobs-table';
import { NewFolderForm } from './new-folder-form';

/**
 * /projects/[id] — one production, in four sections:
 *
 *   SCENES     the scene folders (any number, user-named) of pulled items
 *   JOBS       the orders placed for this project, moving through vendor
 *              confirmation (the former /jobs board, per project)
 *   CREW       the crew requested for this project; empty, a "Need a crew?"
 *              button to /crew; populated, one-line rows that expand into
 *              the contractor's full profile
 *   PAPERWORK  the checklist and the single paperwork folder
 *
 * Each folder row links into the folder; rename/delete are quiet inline
 * controls.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId(`/projects/${id}`);
  const [project, work] = await Promise.all([getProject(orgId, id), getProjectJobs(orgId, id)]);
  if (!project) notFound();

  const jobs = work.jobs.map(toJobRow);
  const crew = work.crew;
  const scenes = sceneFolders(project);
  const paperwork = paperworkFolder(project);
  const itemCount = projectItemCount(project);
  const docCount = projectDocumentCount(project);
  // Profile-only count for the row; the workspace page runs the full build.
  const checklistTotal = evaluate({ profile: project.profile }).summary.total;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          Dashboard
        </Link>

        <div className="mt-6">
          <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
            Project
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {project.name}
          </h1>
          <p className="mt-1 font-mono text-[13px] leading-[18px] text-text-tertiary">
            {plural(scenes.length, 'scene')} · {plural(itemCount, 'item')} ·{' '}
            {plural(docCount, 'document')}
          </p>
        </div>

        {/* Scenes */}
        <section className="mt-10">
          <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Scenes
          </h2>
          <div className="border-t border-border">
            {scenes.length === 0 && (
              <div className="border-b border-border py-10 text-center">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  No scenes yet
                </p>
                <p className="mt-2 text-[15px] text-text-secondary">
                  Add a scene below to start pulling for it.
                </p>
              </div>
            )}
            {scenes.map((folder) => (
              <SceneRow key={folder.id} projectId={project.id} folder={folder} />
            ))}
            <NewFolderForm projectId={project.id} suggestedName={`Scene ${scenes.length + 1}`} />
          </div>
        </section>

        {/* Jobs — the orders placed for this project */}
        <section className="mt-10" aria-labelledby="project-jobs">
          <h2
            id="project-jobs"
            className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary"
          >
            Jobs
          </h2>
          {jobs.length === 0 ? (
            <div className="border-y border-border py-10 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                No orders yet
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Pick this project at checkout and the order tracks here as vendors respond.
              </p>
              <Link
                href="/search"
                className="mt-5 inline-block rounded-md border border-border px-4 py-2 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary transition-colors duration-150 hover:border-foreground hover:text-foreground"
              >
                Browse catalog
              </Link>
            </div>
          ) : (
            <>
              <StatBand stats={work.stats} className="mb-6" />
              <JobsTable jobs={jobs} />
            </>
          )}
        </section>

        {/* Crew — the contractors requested for this project */}
        <section className="mt-10" aria-labelledby="project-crew">
          <h2
            id="project-crew"
            className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary"
          >
            Crew
          </h2>
          {crew.length === 0 ? (
            <div className="border-y border-border py-10 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                No crew on this project
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Extra hands for set days, load-in and load-out, and delivery runs.
              </p>
              <Link
                href={`/crew?project=${encodeURIComponent(project.id)}`}
                className="mt-5 inline-block rounded-md border border-accent px-5 py-2.5 font-mono text-[13px] font-medium text-accent-text transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
              >
                Need a crew?
              </Link>
            </div>
          ) : (
            <>
              <CrewList crew={crew} />
              <Link
                href={`/crew?project=${encodeURIComponent(project.id)}`}
                className="mt-4 inline-block font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
              >
                Request more crew
              </Link>
            </>
          )}
        </section>

        {/* Paperwork */}
        {paperwork && (
          <section className="mt-10">
            <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Paperwork
            </h2>
            <div className="border-t border-border">
              <div className="flex min-h-[64px] items-center gap-4 border-b border-border transition-colors duration-150 hover:bg-surface-inset">
                <Link
                  href={`/projects/${project.id}/paperwork`}
                  className="flex min-w-0 flex-1 items-center gap-4 py-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-surface-inset text-text-secondary">
                    <ClipboardList size={16} strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-[22px] text-foreground">
                      Paperwork checklist
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                      {checklistTotal === 0
                        ? 'Describe the production to build it'
                        : `${plural(checklistTotal, 'item')} from what you have described`}
                    </p>
                  </div>
                </Link>
              </div>
              <div className="flex min-h-[64px] flex-wrap items-center gap-x-4 border-b border-border transition-colors duration-150 hover:bg-surface-inset">
                <Link
                  href={`/projects/${project.id}/folders/${paperwork.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4 py-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-surface-inset text-text-secondary">
                    <FileText size={16} strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-[22px] text-foreground">
                      {paperwork.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                      {paperwork.documents.length === 0
                        ? 'COIs, W9s, invoices, call sheets'
                        : plural(paperwork.documents.length, 'document')}
                    </p>
                  </div>
                </Link>
                <div className="shrink-0 basis-full pb-3 sm:basis-auto sm:py-3">
                  <FolderActions
                    projectId={project.id}
                    folderId={paperwork.id}
                    name={paperwork.name}
                    kind="paperwork"
                    itemCount={paperwork.documents.length}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

function SceneRow({ projectId, folder }: { projectId: string; folder: ProjectFolder }) {
  const thumbs = folder.items.filter((i) => i.image).slice(0, 3);
  const slots = [...thumbs, ...Array<null>(Math.max(0, 3 - thumbs.length)).fill(null)];

  // Link and row controls are siblings — a button inside an anchor is invalid markup.
  return (
    <div className="flex min-h-[64px] flex-wrap items-center gap-x-4 border-b border-border transition-colors duration-150 hover:bg-surface-inset">
      <Link
        href={`/projects/${projectId}/folders/${folder.id}`}
        className="flex min-w-0 flex-1 items-center gap-4 py-3"
      >
        <div className="flex shrink-0 items-center">
          {slots.map((item, i) => (
            <div
              key={item ? item.itemId : `empty-${i}`}
              className="h-10 w-10 overflow-hidden border border-border bg-surface-inset"
              style={{ marginLeft: i === 0 ? 0 : -8, zIndex: slots.length - i }}
            >
              {item && <LightWell src={item.image} alt={item.name} fill />}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-[22px] text-foreground">
            {folder.name}
          </p>
          <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
            {plural(folder.items.length, 'item')}
          </p>
        </div>
      </Link>
      <div className="shrink-0 basis-full pb-3 sm:basis-auto sm:py-3">
        <FolderActions
          projectId={projectId}
          folderId={folder.id}
          name={folder.name}
          kind="scene"
          itemCount={folder.items.length}
        />
      </div>
    </div>
  );
}

/** The four numbers a coordinator glances at before the table: what is still moving. */
function StatBand({ stats, className }: { stats: JobsStats; className?: string }) {
  const tiles: Array<{ label: string; value: number }> = [
    { label: 'Orders in flight', value: stats.ordersInFlight },
    { label: 'Items confirmed', value: stats.itemsConfirmed },
    { label: 'Vendors notified', value: stats.vendorsNotified },
    { label: 'To sign', value: stats.documentsPending },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4', className)}>
      {tiles.map((t) => (
        <div key={t.label} className="bg-background px-4 py-4">
          <p className="font-mono text-[24px] font-medium leading-none tabular-nums text-foreground">{t.value}</p>
          <p className="mt-2 font-mono text-[11px] uppercase leading-[14px] tracking-[0.06em] text-text-tertiary">
            {t.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
