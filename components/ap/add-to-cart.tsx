'use client';

import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/lib/cart-store';
import type { PropItem } from '@/lib/types';

/**
 * The beam button (DESIGN.md section 9.5): the only primary action treatment —
 * a light-filled fill with dark ink, never red. Full column width on item
 * detail. Confirms with a brief "Added" state; if the piece is already in the
 * cart the store ignores the duplicate, so the feedback still reads honestly.
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
      className="flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-primary text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover active:scale-[0.98]"
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
