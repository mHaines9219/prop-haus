import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { getProject } from '@/lib/projects';
import { requireOrgId } from '@/lib/session';
import { SOURCE_META } from '@/lib/types';
import { PageShell } from '@/components/ap/page-shell';
import { RemoveItemButton } from './remove-item-button';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await requireOrgId(`/projects/${id}`);
  const project = await getProject(orgId, id);
  if (!project) notFound();

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          Folders
        </Link>

        <div className="mt-6">
          <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
            Folder
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {project.name}
          </h1>
          <p className="mt-1 font-mono text-[13px] leading-[18px] text-text-tertiary">
            {project.items.length} item{project.items.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="mt-8">
          {project.items.length === 0 ? (
            <div className="border-y border-border py-16 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Nothing saved here yet
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Browse the catalog and save pieces from any vendor into this folder.
              </p>
            </div>
          ) : (
            <div className="border-t border-border">
              {project.items.map((item) => {
                const detailHref = `/item/${item.source}/${encodeURIComponent(item.sourceId)}`;
                const vendorName = SOURCE_META[item.source]?.name ?? item.source;
                return (
                  <div
                    key={item.itemId}
                    className="flex min-h-[88px] items-center gap-5 border-b border-border py-4"
                  >
                    <Link href={detailHref} className="shrink-0">
                      {item.image ? (
                        <div className="relative h-20 w-20 overflow-hidden border border-border bg-plate">
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <span className="block h-20 w-20 border border-border bg-plate" />
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={detailHref}
                        className="block truncate text-[15px] font-medium leading-[22px] text-foreground transition-colors duration-150 hover:text-text-secondary"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                        {vendorName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hidden items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:text-foreground sm:flex"
                      >
                        Vendor
                        <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
                      </a>
                      <RemoveItemButton projectId={project.id} itemId={item.itemId} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
