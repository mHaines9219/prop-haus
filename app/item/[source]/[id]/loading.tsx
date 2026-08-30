import { Card } from '@astryxdesign/core/Card';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Skeleton } from '@astryxdesign/core/Skeleton';

/**
 * Instant feedback for listing clicks. Mirrors page.tsx's above-the-fold
 * layout — back link, then image beside the title/description column. The
 * related strip is below the fold and not worth skeletoning.
 */
export default function Loading() {
  return (
    <div className="space-y-12">
      <Skeleton width={120} height={20} />
      <div className="grid gap-8 md:grid-cols-2">
        <Card padding={0}>
          <AspectRatio ratio={4 / 3}>
            <Skeleton radius="none" />
          </AspectRatio>
        </Card>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton width={90} height={14} />
            <Skeleton width="70%" height={36} index={1} />
            <Skeleton width={140} height={16} index={2} />
          </div>
          <div className="space-y-2">
            <Skeleton width="100%" height={14} index={3} />
            <Skeleton width="90%" height={14} index={4} />
            <Skeleton width="60%" height={14} index={5} />
          </div>
          <Skeleton width={160} height={36} index={6} />
        </div>
      </div>
    </div>
  );
}
