import Link from 'next/link';
import { listProjects } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { NewProjectForm } from './new-project-form';
import { ProjectsTable } from './projects-table';
import { toProjectRow } from './rows';

export const metadata = { title: 'Dashboard · Prop Haus' };

/**
 * /projects — the Dashboard. One row per production; each production owns
 * scene folders of pulled items plus a paperwork folder (see lib/projects.ts).
 * List view, never a card grid (DESIGN.md §9.7). The rows are a sortable,
 * searchable table (projects-table.tsx on the shared DataTable).
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
  const rows = projects.map(toProjectRow);

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

          {rows.length === 0 ? (
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
            <ProjectsTable projects={rows} />
          )}
        </div>
      </div>
    </PageShell>
  );
}
