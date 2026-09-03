import { PageShell } from '@/components/ap/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

/** /jobs while the overview loads: the header, stat band and five rows, in place (DESIGN.md §9.9). */
export default function JobsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
        <div className="mb-10">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="bg-background px-4 py-5">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="mt-3 h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="mt-12">
          <Skeleton className="h-3 w-16" />
          <div className="mt-4 border-t border-border">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex h-16 items-center gap-4 border-b border-border">
                <Skeleton className="h-10 w-14" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
