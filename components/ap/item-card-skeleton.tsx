/**
 * An ad box before its copy is pasted up: the rule and grey slots (DESIGN.md
 * §9.9). The placard below the well keeps ItemCard's exact slot heights
 * (headline 30px, listing 14px, vendor/tag row 27px, same margins) so a
 * skeleton row is as tall as the card row that replaces it.
 */
export function ItemCardSkeleton() {
  return (
    <div className="sheet h-full border-[1.5px] border-ink/40 bg-card p-3">
      <div className="aspect-[4/5] animate-pulse border border-ink/20 bg-surface-inset" />
      <div className="mt-3">
        <div className="min-h-[30px]">
          <div className="h-[15px] w-4/5 animate-pulse bg-surface-inset" />
        </div>
        <div className="mt-1.5 min-h-[14px]">
          <div className="h-[11px] w-2/5 animate-pulse bg-surface-inset" />
        </div>
        <div className="mt-2.5 flex min-h-[27px] items-end justify-between gap-2">
          <div className="h-[14px] w-1/3 animate-pulse bg-surface-inset" />
          <div className="h-[27px] w-16 animate-pulse bg-surface-inset" />
        </div>
      </div>
    </div>
  );
}
