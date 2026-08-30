export function ItemCardSkeleton() {
  return (
    <div className="bg-background p-4">
      <div className="aspect-[4/5] animate-pulse rounded-sm border border-border bg-surface-inset" />
      <div className="mt-3">
        <div className="h-[18px] w-4/5 animate-pulse rounded-sm bg-surface-inset" />
        <div className="mt-2 h-[14px] w-2/5 animate-pulse rounded-sm bg-surface-inset" />
        <div className="mt-3 h-[11px] w-1/3 animate-pulse rounded-sm bg-surface-inset" />
      </div>
    </div>
  );
}
