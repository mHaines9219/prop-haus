'use client';

import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/lib/cart-store';
import type { PropItem } from '@/lib/types';

/**
 * Party Line primary action: the coral phone-number block, full column width
 * on item detail. Confirms with a brief "In your cart" state that drops to
 * the outlined secondary treatment, a settled, non-urgent action.
 * If the piece is already in the cart the store ignores the duplicate, so the
 * feedback still reads honestly.
 */
export function AddToCart({ item }: { item: PropItem }) {
  const add = useCart((s) => s.add);
  const inCart = useCart((s) => s.lines.some((l) => l.item.id === item.id));
  const [justAdded, setJustAdded] = useState(false);

  const added = inCart || justAdded;

  return (
    <button
      type="button"
      onClick={() => {
        add({
          id: item.id,
          source: item.source,
          sourceId: item.sourceId,
          name: item.name,
          images: item.images.slice(0, 1),
          sourceUrl: item.sourceUrl,
          category: item.category,
        });
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1400);
      }}
      className={
        added
          ? 'flex h-11 w-full items-center justify-center gap-2 border-[1.5px] border-border bg-card font-heading text-[14px] font-extrabold uppercase tracking-[0.05em] text-foreground transition-colors duration-150 hover:bg-surface-inset active:scale-[0.98]'
          : 'flex h-11 w-full items-center justify-center gap-2 border-[1.5px] border-accent bg-accent font-heading text-[14px] font-extrabold uppercase tracking-[0.05em] text-accent-foreground transition-colors duration-150 hover:bg-primary-hover active:scale-[0.98]'
      }
    >
      {added ? (
        <Check size={16} strokeWidth={2.25} aria-hidden />
      ) : (
        <Plus size={16} strokeWidth={2.25} aria-hidden />
      )}
      {added ? 'In your cart' : 'Add to cart'}
    </button>
  );
}
