import { PageShell } from '@/components/ap/page-shell';
import { ItemCardSkeleton } from '@/components/ap/item-card-skeleton';
import { SeamGrid } from '@/components/ap/seam-grid';

/**
 * /category/[slug] while the cards load. The frame, the header slots and the
 * grid mirror page.tsx measure for measure (same container width and padding,
 * same line heights) so the swap to the real page moves nothing.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1400px] px-3 py-8 sm:px-5 sm:py-10">
        {/* "< Catalog" back link: 13px text at the body line height */}
        <div className="h-5 w-24 animate-pulse bg-surface-inset" />
        <div className="mt-6">
          {/* eyebrow 14px, title 34px, count 18px: the page's own line heights */}
          <div className="h-3.5 w-16 animate-pulse bg-surface-inset" />
          <div className="mt-2 h-[34px] w-48 animate-pulse bg-surface-inset" />
          <div className="mt-2 h-[18px] w-28 animate-pulse bg-surface-inset" />
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
