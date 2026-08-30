'use client';

import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/lib/cart-store';
import type { PropItem } from '@/lib/types';

/**
 * Nocturne outlined primary action. Full column width on item detail.
 * Confirms with a brief "In your cart" state; the confirmed state uses the
 * secondary outlined treatment to signal a settled, non-urgent action.
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
          ? 'flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/7 active:scale-[0.98]'
          : 'flex h-11 w-full items-center justify-center gap-2 rounded-md border border-accent text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent/12 active:scale-[0.98]'
      }
    >
      {added ? (
        <Check size={16} strokeWidth={1.5} aria-hidden />
      ) : (
        <Plus size={16} strokeWidth={1.5} aria-hidden />
      )}
      {added ? 'In your cart' : 'Add to cart'}
    </button>
  );
}
