'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart-store';
import type { PropItem } from '@/lib/types';

export function AddToCart({ item }: { item: PropItem }) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  return (
    <button
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
        setAdded(true);
        setTimeout(() => setAdded(false), 1200);
      }}
      className="font-sans uppercase tracking-widest text-sm px-4 py-2 bg-ink text-paper hover:bg-accent transition"
    >
      {added ? 'Added ✓' : 'Add to cart'}
    </button>
  );
}
