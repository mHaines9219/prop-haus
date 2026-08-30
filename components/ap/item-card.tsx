'use client';

import Link from 'next/link';
import { Plus, Check } from 'lucide-react';
import { useState } from 'react';
import type { CardItem } from '@/lib/types';
import { SOURCE_META } from '@/lib/types';
import { useCart } from '@/lib/cart-store';
import { cn } from '@/lib/utils';
import { LightWell } from './light-well';

const PRICE_UNIT_LABELS: Record<string, string> = {
  day: 'DAY',
  week: 'WK',
  month: 'MO',
  event: 'EVT',
  purchase: 'BUY',
};

function formatDataLine(item: CardItem): string | null {
  if (item.price) {
    const amount = item.price.amount.toFixed(2);
    const unit = item.price.unit ? `/${PRICE_UNIT_LABELS[item.price.unit] ?? item.price.unit.toUpperCase()}` : '';
    return `${amount}${unit}`;
  }
  if (item.dimensions?.width) {
    return `W ${Math.round(item.dimensions.width)} IN`;
  }
  return null;
}

/**
 * Ruled-grid cell (DESIGN.md section 9.4): light well + fixed-slot placard.
 * The whole cell is one link; the well beams up on hover/focus via `.group`.
 * Slots hold their height even when a value is missing so seam rows align.
 *
 * marquee: spans a 2×2 grid cell on the home page; well fills height, name
 * steps up to 18px Switzer 600 (DESIGN.md v1.1 §9.2).
 */
export function ItemCard({ item, marquee }: { item: CardItem; marquee?: boolean }) {
  const add = useCart((s) => s.add);
  const inCart = useCart((s) => s.lines.some((l) => l.item.id === item.id));
  const [added, setAdded] = useState(false);

  function handleQuickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inCart) return;
    add({
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      name: item.name,
      images: item.images,
      sourceUrl: item.sourceUrl,
      category: item.category,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  }

  const dataLine = formatDataLine(item);
  const mode = item.plateMode ?? 'cutout';

  return (
    <Link
      href={`/item/${item.source}/${encodeURIComponent(item.sourceId)}`}
      className={cn(
        'group bg-background p-4',
        marquee ? 'flex h-full flex-col' : 'block',
      )}
    >
      <div className={cn('relative', marquee ? 'flex-1' : undefined)}>
        <LightWell
          src={item.images[0]}
          alt={item.name}
          name={item.name}
          sizes={
            marquee
              ? '(max-width: 768px) 100vw, (max-width: 1280px) 66vw, 640px'
              : '(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 320px'
          }
          mode={mode}
          fill={marquee}
        />

        {/* Quick-add (DESIGN.md §9.4.2): always visible on touch, hover-revealed otherwise */}
        <button
          type="button"
          aria-label={inCart || added ? 'Added to cart' : 'Add to cart'}
          onClick={handleQuickAdd}
          className={cn(
            'absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-[rgba(15,15,16,0.85)] text-foreground transition-opacity duration-[160ms] ease-attend',
            // Hidden at rest on fine pointers, revealed on hover/focus.
            // Always visible on coarse pointers (touch) per DESIGN.md §9.4.2.
            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            '[@media(pointer:coarse)]:opacity-100',
          )}
        >
          {inCart || added ? (
            <Check size={14} strokeWidth={1.5} aria-hidden />
          ) : (
            <Plus size={14} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </div>

      {/* Fixed-slot placard (DESIGN.md §9.4.3) */}
      <div className="mt-3">
        <p
          className={cn(
            'line-clamp-2 leading-[1.33] text-foreground',
            marquee
              ? 'min-h-[48px] text-[18px] font-semibold'
              : 'min-h-[44px] text-[15px] font-medium',
          )}
        >
          {item.name}
        </p>
        <p className="min-h-[19px] truncate text-[13px] leading-[19px] text-text-tertiary">
          {item.subcategory ?? ''}
        </p>
        {/* Vendor credit left, camera-report data right — fixed height even when absent */}
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="truncate font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-secondary">
            {SOURCE_META[item.source].name}
          </p>
          {dataLine && (
            <p className="shrink-0 font-mono text-[13px] leading-[18px] tabular-nums text-text-secondary">
              {dataLine}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
