export function ItemCardSkeleton() {
  return (
    <div className="bg-background p-4">
      <div className="aspect-[4/5] animate-pulse rounded-md border border-border bg-card/50" />
      <div className="mt-3">
        <div className="h-[18px] w-4/5 animate-pulse rounded-md bg-card/50" />
        <div className="mt-2 h-[14px] w-2/5 animate-pulse rounded-md bg-card/50" />
        <div className="mt-3 h-[11px] w-1/3 animate-pulse rounded-md bg-card/50" />
      </div>
    </div>
  );
}
