import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileText } from 'lucide-react';
import {
  getProject,
  paperworkFolder,
  projectDocumentCount,
  projectItemCount,
  sceneFolders,
  type ProjectFolder,
} from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import { FolderActions } from './folder-actions';
import { NewFolderForm } from './new-folder-form';

/**
 * /projects/[id] — one production. Its scene folders (any number, user-named)
 * are listed first, then the single paperwork folder. Each row links into the
 * folder; rename/delete are quiet inline controls.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId(`/projects/${id}`);
  const project = await getProject(orgId, id);
  if (!project) notFound();

  const scenes = sceneFolders(project);
  const paperwork = paperworkFolder(project);
  const itemCount = projectItemCount(project);
  const docCount = projectDocumentCount(project);

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

        {/* Paperwork */}
        {paperwork && (
          <section className="mt-10">
            <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Paperwork
            </h2>
            <div className="border-t border-border">
              <div className="flex min-h-[64px] items-center gap-4 border-b border-border transition-colors duration-150 hover:bg-surface-inset">
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
                <div className="shrink-0 py-3">
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
    <div className="flex min-h-[64px] items-center gap-4 border-b border-border transition-colors duration-150 hover:bg-surface-inset">
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
      <div className="shrink-0 py-3">
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

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
