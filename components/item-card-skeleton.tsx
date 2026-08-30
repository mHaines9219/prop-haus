import { Card } from '@astryxdesign/core/Card';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Skeleton } from '@astryxdesign/core/Skeleton';

/** Shimmer placeholder matching ItemCard's shape: 4:5 image, two text lines. */
export function ItemCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <Card padding={0}>
      <AspectRatio ratio={4 / 5}>
        <Skeleton radius="none" index={index} />
      </AspectRatio>
      <div className="space-y-2 p-3">
        <Skeleton width="80%" height={16} index={index} />
        <Skeleton width="50%" height={12} index={index} />
      </div>
    </Card>
  );
}
