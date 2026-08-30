import Link from 'next/link';
import { listProjects } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { ArchiveButton } from './archive-button';

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
          Folders
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <h1 className="text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {showArchived ? 'All folders' : 'Your folders'}
          </h1>
          <Link
            href={showArchived ? '/projects' : '/projects?archived=1'}
            className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:text-foreground"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
        <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">
          Items you&rsquo;ve saved while browsing the catalog, by project.
        </p>

        <div className="mt-8">
          {projects.length === 0 ? (
            <div className="border-y border-border py-16 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {showArchived ? 'No folders yet' : 'No active folders'}
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                {showArchived
                  ? 'Folders appear here once you save an item to a project while browsing.'
                  : 'Nothing active right now. Browse the catalog to start a new folder.'}
              </p>
            </div>
          ) : (
            <div className="border-t border-border">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="group flex min-h-[56px] items-center justify-between gap-4 border-b border-border px-0 py-4 transition-colors duration-150 hover:bg-surface-inset"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium leading-[22px] text-foreground group-hover:text-foreground">
                      {p.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                      {p.items.length} item{p.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {p.archivedAt && (
                      <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                        Archived
                      </span>
                    )}
                    <ArchiveButton projectId={p.id} isArchived={Boolean(p.archivedAt)} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
