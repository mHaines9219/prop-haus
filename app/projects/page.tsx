import Link from 'next/link';
import {
  allItems,
  listProjects,
  projectDocumentCount,
  projectItemCount,
  sceneFolders,
} from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import { ArchiveButton } from './archive-button';
import { NewProjectForm } from './new-project-form';

export const metadata = { title: 'Dashboard · Prop Haus' };

/**
 * /projects — the Dashboard. One row per production; each production owns
 * scene folders of pulled items plus a paperwork folder (see lib/projects.ts).
 * List view, never a card grid (DESIGN.md §9.7).
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === '1';
  const orgId = await requireOrgId('/projects');
  const projects = await listProjects(orgId, { includeArchived: showArchived });

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
          Dashboard
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <h1 className="text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {showArchived ? 'All projects' : 'Your projects'}
          </h1>
          <Link
            href={showArchived ? '/projects' : '/projects?archived=1'}
            className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:text-foreground"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
        <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">
          One project per production. Sort what you pull by scene, and keep the paperwork with it.
        </p>

        <div className="mt-8 border-t border-border">
          <NewProjectForm />

          {projects.length === 0 ? (
            <div className="border-b border-border py-16 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {showArchived ? 'No projects yet' : 'No active projects'}
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                {showArchived
                  ? 'Start a project above, then save pieces into its scenes while you browse.'
                  : 'Nothing active right now. Start a project above to begin pulling for it.'}
              </p>
            </div>
          ) : (
            projects.map((p) => {
              const scenes = sceneFolders(p);
              const itemCount = projectItemCount(p);
              const docCount = projectDocumentCount(p);
              const thumbs = allItems(p).filter((i) => i.image).slice(0, 3);
              const slots = [...thumbs, ...Array<null>(Math.max(0, 3 - thumbs.length)).fill(null)];

              // The link and the row controls are siblings: a button inside an
              // anchor is invalid markup and fights the click.
              return (
                <div
                  key={p.id}
                  className="flex min-h-[64px] items-center gap-4 border-b border-border transition-colors duration-150 hover:bg-surface-inset"
                >
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 py-3"
                  >
                    {/* Filmstrip: three 40px wells overlapping by 8px; empty slots stay visible so a new project looks deliberate. */}
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
                        {p.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                        {plural(scenes.length, 'scene')} · {plural(itemCount, 'item')} ·{' '}
                        {plural(docCount, 'document')}
                      </p>
                    </div>
                  </Link>

                  <div className="flex shrink-0 items-center gap-3 py-3">
                    <span className="hidden font-mono text-[11px] leading-[14px] text-text-tertiary sm:block">
                      {formatDate(p.updatedAt)}
                    </span>
                    {p.archivedAt && (
                      <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                        Archived
                      </span>
                    )}
                    <ArchiveButton projectId={p.id} isArchived={Boolean(p.archivedAt)} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </PageShell>
  );
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
