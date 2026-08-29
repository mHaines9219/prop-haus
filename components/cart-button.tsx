'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { useCart } from '@/lib/cart-store';

export function CartButton() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? lines.length : 0;

  return (
    <Button
      label="Cart"
      variant="secondary"
      onClick={() => router.push('/cart')}
      endContent={count > 0 ? <Badge label={String(count)} /> : undefined}
    />
  );
}
