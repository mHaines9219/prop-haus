import { PageShell } from '@/components/ap/page-shell';
import { ItemCardSkeleton } from '@/components/ap/item-card-skeleton';
import { SeamGrid } from '@/components/ap/seam-grid';

/**
 * /category/[slug] while the cards load. The frame, the header slots, the
 * search bar, the filter rail and the grid mirror page.tsx measure for
 * measure (same container width, padding, columns and line heights) so the
 * swap to the real page moves nothing.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1400px] px-3 py-8 sm:px-5 sm:py-10">
        {/* "< Catalog" back link: 13px text at the body line height */}
        <div className="h-5 w-24 animate-pulse bg-surface-inset" />
        <div className="mt-6">
          {/* eyebrow 14px, title 34px: the page's own line heights */}
          <div className="h-3.5 w-16 animate-pulse bg-surface-inset" />
          <div className="mt-2 h-[34px] w-48 animate-pulse bg-surface-inset" />
        </div>
        <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
          {/* search bar 48px + its 14px hint line */}
          <div className="max-w-[760px] lg:col-start-2 lg:row-start-1">
            <div className="h-12 animate-pulse bg-surface-inset" />
            <div className="mt-3 h-3.5 w-56 animate-pulse bg-surface-inset" />
          </div>
          {/* the rail: its heading rule, then group stubs on large screens */}
          <div className="lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <div className="h-7 w-full animate-pulse bg-surface-inset" />
            <div className="hidden space-y-6 pt-4 lg:block">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-5 w-20 animate-pulse bg-surface-inset" />
                  <div className="h-[26px] w-full animate-pulse bg-surface-inset" />
                  <div className="h-[26px] w-5/6 animate-pulse bg-surface-inset" />
                  <div className="h-[26px] w-2/3 animate-pulse bg-surface-inset" />
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-start-2 lg:row-start-2">
            <div className="h-[18px] w-28 animate-pulse bg-surface-inset" />
            <div className="mt-6">
              <SeamGrid>
                {Array.from({ length: 12 }, (_, i) => (
                  <ItemCardSkeleton key={i} />
                ))}
              </SeamGrid>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
