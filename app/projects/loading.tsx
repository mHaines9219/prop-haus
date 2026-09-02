import { PageShell } from '@/components/ap/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

/** /projects while the list loads: the header and five rows, in place (DESIGN.md §9.9). */
export default function ProjectsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-8 border-t border-border">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-16 items-center gap-4 border-b border-border">
              <Skeleton className="h-10 w-14" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
