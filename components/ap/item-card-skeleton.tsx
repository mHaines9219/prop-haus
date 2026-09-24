/** An ad box before its copy is pasted up: the rule and four grey slots (DESIGN.md §9.9). */
export function ItemCardSkeleton() {
  return (
    <div className="sheet h-full border-[1.5px] border-ink/40 bg-card p-3">
      <div className="aspect-[4/5] animate-pulse border border-ink/20 bg-surface-inset" />
      <div className="mt-3">
        <div className="h-[15px] w-4/5 animate-pulse bg-surface-inset" />
        <div className="mt-2 h-[11px] w-2/5 animate-pulse bg-surface-inset" />
        <div className="mt-3 h-[22px] w-1/3 animate-pulse bg-surface-inset" />
      </div>
    </div>
  );
}
