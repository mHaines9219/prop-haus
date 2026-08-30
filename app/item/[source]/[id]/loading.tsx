import { PageShell } from '@/components/ap/page-shell';

/**
 * Instant feedback for listing clicks (DESIGN.md section 9.9): skeletons mirror
 * the real layout in surface-inset shapes with the pulse. The image skeleton
 * keeps the matted 4:5 well shape and stays dark — no white flashes before the
 * photo decodes.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="h-[18px] w-28 animate-pulse rounded-sm bg-surface-inset" />

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="border border-border bg-background p-6">
            <div className="mx-auto aspect-[4/5] max-w-[600px] animate-pulse rounded-sm border border-border bg-surface-inset" />
          </div>

          <div className="lg:pt-2">
            <div className="h-[30px] w-4/5 animate-pulse rounded-sm bg-surface-inset" />
            <div className="mt-3 h-[14px] w-32 animate-pulse rounded-sm bg-surface-inset" />
            <div className="mt-6 space-y-2">
              <div className="h-[14px] w-full animate-pulse rounded-sm bg-surface-inset" />
              <div className="h-[14px] w-11/12 animate-pulse rounded-sm bg-surface-inset" />
              <div className="h-[14px] w-3/5 animate-pulse rounded-sm bg-surface-inset" />
            </div>
            <div className="mt-8 space-y-px border-t border-border">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-11 animate-pulse border-b border-border bg-surface-inset/40" />
              ))}
            </div>
            <div className="mt-8 h-11 w-full animate-pulse rounded-sm bg-surface-inset" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
