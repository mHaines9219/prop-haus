import { Grid } from '@astryxdesign/core/Grid';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { ItemCardSkeleton } from '@/components/item-card-skeleton';

/**
 * Without this boundary, clicking a category link gives no visual response
 * until the server render streams back — the navigation looks dead for the
 * whole round trip. The skeleton mirrors page.tsx: header block, then grid.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Skeleton width={100} height={20} />
        <Skeleton width={260} height={36} />
        <Skeleton width={180} height={16} />
      </header>
      <Grid columns={{ minWidth: 200 }} gap={5}>
        {Array.from({ length: 12 }, (_, i) => (
          <ItemCardSkeleton key={i} index={i} />
        ))}
      </Grid>
    </div>
  );
}
