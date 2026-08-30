import Link from 'next/link';
import type { CardItem } from '@/lib/types';
import { SOURCE_META } from '@/lib/types';
import { LightWell } from './light-well';

/**
 * Ruled-grid cell (DESIGN.md section 9.4): light well + fixed-slot placard.
 * The whole cell is one link; the well beams up on hover/focus via `.group`.
 * Slots hold their height even when a value is missing so seam rows align.
 */
export function ItemCard({ item }: { item: CardItem }) {
  return (
    <Link
      href={`/item/${item.source}/${encodeURIComponent(item.sourceId)}`}
      className="group block bg-background p-4"
    >
      <LightWell
        src={item.images[0]}
        alt={item.name}
        name={item.name}
        mode={item.plateMode ?? 'cutout'}
        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 320px"
      />
      <div className="mt-3">
        <p className="line-clamp-2 min-h-[44px] text-[15px] font-medium leading-[22px] text-foreground">
          {item.name}
        </p>
        <p className="min-h-[19px] truncate text-[13px] leading-[19px] text-text-tertiary">
          {item.subcategory ?? ''}
        </p>
        <p className="mt-2 truncate font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-secondary">
          {SOURCE_META[item.source].name}
        </p>
      </div>
    </Link>
  );
}
