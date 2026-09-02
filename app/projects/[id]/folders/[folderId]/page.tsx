import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Download, ExternalLink, FileText } from 'lucide-react';
import { findFolder, getProject, type ProjectFolder } from '@/lib/projects';
import { documentTypeLabel, formatBytes } from '@/lib/paperwork';
import { requireOrgId } from '@/lib/session';
import { CLIP_SOURCE, SOURCE_META, type SavedSource, type Source } from '@/lib/types';
import { safeExternalUrl } from '@/lib/safe-url';
import { hostnameLabel } from '@/lib/clip/retailers';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import { RemoveItemButton } from './remove-item-button';
import { RemoveDocumentButton } from './remove-document-button';
import { ClipForm } from './clip-form';
import { UploadForm } from './upload-form';

function isClip(source: SavedSource): boolean {
  return source === CLIP_SOURCE;
}

/**
 * /projects/[id]/folders/[folderId] — one folder inside a production.
 * A scene folder lists pulled items (catalog + web clips) with the clipper.
 * The paperwork folder lists uploaded documents with the uploader.
 */
export default async function FolderPage({
  params,
}: {
  params: Promise<{ id: string; folderId: string }>;
}) {
  const { id, folderId } = await params;
  const orgId = await requireOrgId(`/projects/${id}/folders/${folderId}`);
  const project = await getProject(orgId, id);
  if (!project) notFound();
  const folder = findFolder(project, folderId);
  if (!folder) notFound();

  const isPaperwork = folder.kind === 'paperwork';
  const count = isPaperwork ? folder.documents.length : folder.items.length;

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

        <div className="mt-6">
          <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
            {isPaperwork ? 'Paperwork' : 'Scene'}
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {folder.name}
          </h1>
          <p className="mt-1 font-mono text-[13px] leading-[18px] text-text-tertiary">
            {count} {isPaperwork ? 'document' : 'item'}
            {count === 1 ? '' : 's'}
          </p>
        </div>

        <div className="mt-8 border-t border-border">
          {isPaperwork ? (
            <PaperworkBody projectId={project.id} folder={folder} />
          ) : (
            <SceneBody projectId={project.id} folder={folder} />
          )}
        </div>
      </div>
    </PageShell>
  );
}

// ── scene ────────────────────────────────────────────────────────────────────

function SceneBody({ projectId, folder }: { projectId: string; folder: ProjectFolder }) {
  return (
    <>
      <ClipForm
        projectId={projectId}
        folderId={folder.id}
        existingItemIds={folder.items.map((i) => i.itemId)}
      />

      {folder.items.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Nothing pulled for this scene yet
          </p>
          <p className="mt-2 text-[15px] text-text-secondary">
            Browse the catalog and save pieces from any vendor into this scene, or add a piece from
            the web above.
          </p>
        </div>
      ) : (
        <div>
          {folder.items.map((item) => {
            const clip = isClip(item.source);
            // A clip has no internal /item page — its detail IS the retailer
            // listing. Catalog items keep the internal detail link.
            const externalHref = safeExternalUrl(item.sourceUrl);
            const detailHref = clip
              ? undefined
              : `/item/${item.source}/${encodeURIComponent(item.sourceId)}`;
            const vendorLabel = clip
              ? (item.meta?.retailer ?? hostnameLabel(item.sourceUrl))
              : (SOURCE_META[item.source as Source]?.name ?? item.source);

            // Every inventory photo sits in a LightWell (DESIGN.md §4), never a bare tile.
            const thumb = (
              <div className="h-20 w-20 overflow-hidden border border-border bg-plate">
                <LightWell src={item.image} alt={item.name} name={item.name} sizes="80px" fill />
              </div>
            );

            return (
              <div
                key={item.itemId}
                className="flex min-h-[88px] items-center gap-5 border-b border-border py-4"
              >
                {clip ? (
                  externalHref ? (
                    <a href={externalHref} target="_blank" rel="noreferrer" className="shrink-0">
                      {thumb}
                    </a>
                  ) : (
                    <span className="shrink-0">{thumb}</span>
                  )
                ) : (
                  <Link href={detailHref!} className="shrink-0">
                    {thumb}
                  </Link>
                )}

                <div className="min-w-0 flex-1">
                  {clip ? (
                    externalHref ? (
                      <a
                        href={externalHref}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[15px] font-medium leading-[22px] text-foreground transition-colors duration-150 hover:text-text-secondary"
                      >
                        {item.name}
                      </a>
                    ) : (
                      <span className="block truncate text-[15px] font-medium leading-[22px] text-foreground">
                        {item.name}
                      </span>
                    )
                  ) : (
                    <Link
                      href={detailHref!}
                      className="block truncate text-[15px] font-medium leading-[22px] text-foreground transition-colors duration-150 hover:text-text-secondary"
                    >
                      {item.name}
                    </Link>
                  )}
                  <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                    {vendorLabel}
                    {clip ? ' · Web clip' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {externalHref && (
                    <a
                      href={externalHref}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:text-foreground sm:flex"
                    >
                      {clip ? 'Retailer' : 'Vendor'}
                      <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
                    </a>
                  )}
                  <RemoveItemButton projectId={projectId} folderId={folder.id} itemId={item.itemId} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── paperwork ────────────────────────────────────────────────────────────────

function PaperworkBody({ projectId, folder }: { projectId: string; folder: ProjectFolder }) {
  return (
    <>
      <UploadForm projectId={projectId} folderId={folder.id} />

      {folder.documents.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            No paperwork yet
          </p>
          <p className="mt-2 text-[15px] text-text-secondary">
            Upload the production&rsquo;s COIs, W9s, invoices and call sheets so they live with the
            pull.
          </p>
        </div>
      ) : (
        <div>
          {folder.documents.map((doc) => {
            const href = `/api/projects/${projectId}/documents/${doc.id}`;
            return (
              <div
                key={doc.id}
                className="flex min-h-[72px] items-center gap-5 border-b border-border py-4"
              >
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 w-12 shrink-0 items-center justify-center border border-border bg-surface-inset text-text-secondary transition-colors duration-150 hover:text-foreground"
                  aria-label={`Open ${doc.name}`}
                >
                  <FileText size={18} strokeWidth={1.5} aria-hidden />
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[15px] font-medium leading-[22px] text-foreground transition-colors duration-150 hover:text-text-secondary"
                  >
                    {doc.name}
                  </a>
                  <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                    {documentTypeLabel(doc.mime)} · {formatBytes(doc.sizeBytes)} ·{' '}
                    {formatDate(doc.uploadedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:text-foreground sm:flex"
                  >
                    Download
                    <Download size={12} strokeWidth={1.5} aria-hidden />
                  </a>
                  <RemoveDocumentButton
                    projectId={projectId}
                    folderId={folder.id}
                    documentId={doc.id}
                    name={doc.name}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
