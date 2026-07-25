'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useCart } from '@/lib/cart-store';
import type { PropItem } from '@/lib/types';

export function AddToCart({ item }: { item: PropItem }) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  return (
    <Button
      label={added ? 'Added ✓' : 'Add to cart'}
      variant="primary"
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
    />
  );
}
