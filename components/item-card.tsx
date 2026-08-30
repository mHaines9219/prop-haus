import Image from 'next/image';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Badge } from '@astryxdesign/core/Badge';
import { Text } from '@astryxdesign/core/Text';
import type { CardItem } from '@/lib/types';
import { SOURCE_META } from '@/lib/types';

export function ItemCard({
  item,
  matchedVia,
}: {
  item: CardItem;
  matchedVia?: string[];
}) {
  const img = item.images[0];
  return (
    <ClickableCard
      href={`/item/${item.source}/${encodeURIComponent(item.sourceId)}`}
      label={item.name}
      padding={0}
    >
      <div className="relative overflow-hidden">
        <AspectRatio ratio={4 / 5} fit="cover">
          {img ? (
            // next/image rather than the scraped original: vendor images are
            // frequently multi-MB, and a grid of them dominated page weight.
            // `sizes` tracks the grid's ~200-320px columns (2-up on mobile).
            <Image
              src={img}
              alt={item.name}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 320px"
              className="object-cover transition-transform duration-300 hover:scale-[1.03]"
            />
          ) : (
            <span className="grid h-full w-full place-items-center">
              <Text type="supporting" color="placeholder">
                No image
              </Text>
            </span>
          )}
        </AspectRatio>
        <span className="absolute left-2 top-2">
          <Badge label={SOURCE_META[item.source].name} />
        </span>
        {matchedVia && matchedVia.length > 0 && (
          <span className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {matchedVia.slice(0, 3).map((tag, i) => (
              <Badge key={i} label={tag} variant="blue" />
            ))}
          </span>
        )}
      </div>
      <div className="p-3">
        <Text weight="medium" maxLines={2}>
          {item.name}
        </Text>
        {item.subcategory && (
          <Text type="supporting" color="secondary">
            {item.subcategory}
          </Text>
        )}
      </div>
    </ClickableCard>
  );
}
