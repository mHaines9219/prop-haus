import { PageShell } from '@/components/ap/page-shell';
import { ItemCardSkeleton } from '@/components/ap/item-card-skeleton';
import { SeamGrid } from '@/components/ap/seam-grid';

export default function Loading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="h-5 w-24 animate-pulse rounded-sm bg-surface-inset" />
        <div className="mt-6 space-y-2">
          <div className="h-3.5 w-16 animate-pulse rounded-sm bg-surface-inset" />
          <div className="h-8 w-48 animate-pulse rounded-sm bg-surface-inset" />
          <div className="h-4 w-28 animate-pulse rounded-sm bg-surface-inset" />
        </div>
        <div className="mt-8">
          <SeamGrid>
            {Array.from({ length: 12 }, (_, i) => (
              <ItemCardSkeleton key={i} />
            ))}
          </SeamGrid>
        </div>
      </div>
    </PageShell>
  );
}
