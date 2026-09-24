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
 * ItemCard — the ad box (DESIGN.md §9.4). One listing in the directory:
 * cream stock, an ink rule, the picture, the name as a red condensed
 * headline, the subcategory as a listing line, the vendor bottom-left and
 * the price bottom-right in a coral phone-number tag.
 *
 * The card is its own `.sheet`, so it prints as paper whether it sits on the
 * green vinyl (home page) or on a page (search, category).
 *
 * marquee: spans a 2×2 grid cell; the well fills the height and the headline
 * steps up.
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
        'group sheet border-[1.5px] border-ink bg-card p-3 text-foreground transition-[box-shadow,transform] duration-150 ease-attend hover:shadow-[3px_3px_0_var(--ink)] motion-safe:hover:-translate-x-px motion-safe:hover:-translate-y-px',
        marquee ? 'flex h-full flex-col' : 'block h-full',
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

        {/* Quick-add: always visible on touch, hover-revealed otherwise */}
        <button
          type="button"
          aria-label={inCart || added ? 'Added to cart' : 'Add to cart'}
          onClick={handleQuickAdd}
          className={cn(
            'absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center border-[1.5px] border-ink bg-accent text-accent-foreground transition-opacity duration-[160ms] ease-attend',
            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            '[@media(pointer:coarse)]:opacity-100',
          )}
        >
          {inCart || added ? (
            <Check size={14} strokeWidth={2.25} aria-hidden />
          ) : (
            <Plus size={14} strokeWidth={2.25} aria-hidden />
          )}
        </button>
      </div>

      {/* Fixed-slot placard: heights hold even when a value is missing so rows align */}
      <div className="mt-3">
        <p
          className={cn(
            'ad-headline line-clamp-2',
            marquee ? 'min-h-[36px] text-[18px] leading-[18px]' : 'min-h-[30px] text-[15px] leading-[15px]',
          )}
        >
          {item.name}
        </p>
        <p className="listing mt-1.5 min-h-[14px] truncate">
          <span>{item.subcategory ?? ''}</span>
        </p>
        {/* Vendor credit left, price tag right */}
        <div className="mt-2.5 flex min-h-[26px] items-end justify-between gap-2">
          <p className="truncate font-heading text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] text-foreground/75">
            {SOURCE_META[item.source].name}
          </p>
          {dataLine && (
            <span className="tag shrink-0 font-mono tabular-nums">
              {dataLine}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
