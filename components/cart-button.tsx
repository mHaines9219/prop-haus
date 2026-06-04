'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-store';

export function CartButton() {
  const lines = useCart((s) => s.lines);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? lines.reduce((n, l) => n + l.qty, 0) : 0;
  return (
    <Link
      href="/cart"
      className="font-sans uppercase tracking-widest text-sm border border-ink/40 px-3 py-1.5 rounded-full hover:bg-ink hover:text-paper transition"
    >
      Cart {mounted && count > 0 ? <span className="ml-1 font-semibold">({count})</span> : null}
    </Link>
  );
}
