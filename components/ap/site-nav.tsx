'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-store';
import { createClient } from '@/lib/supabase/client';

const NAV = [
  { label: 'Seating', href: '/category/seating' },
  { label: 'Lighting', href: '/category/lighting' },
  { label: 'Themed', href: '/category/themed-event' },
  { label: 'Pulls', href: '/projects' },
];

/**
 * Answer Print app chrome (DESIGN.md section 9.1): 56px canvas bar, hairline
 * bottom seam, no blur, no shadow. Wordmark is the locked lockup: Anybody 800
 * at width 150. The cart count is a tally-red badge with a mono digit ticker.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background">
      <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-display text-base font-extrabold uppercase leading-none tracking-[0.04em] text-foreground [font-stretch:150%]">
            Prop Haus
          </span>
          <span className="hidden font-mono text-[11px] uppercase leading-none tracking-[0.08em] text-text-tertiary sm:inline">
            Los Angeles
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <CartLink />
          <AuthControl />
        </div>
      </div>
    </header>
  );
}

function CartLink() {
  const lines = useCart((s) => s.lines);
  const reduce = useReducedMotion();
  // Hydration guard: the store is persisted, so the server render has no count.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? lines.length : 0;

  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? `Cart, ${count} items` : 'Cart'}
      className="relative text-text-secondary transition-colors duration-150 hover:text-foreground"
    >
      <ShoppingCart size={20} strokeWidth={1.5} aria-hidden />
      {count > 0 && (
        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center overflow-hidden rounded-sm bg-accent px-1 font-mono text-[11px] font-medium leading-none text-accent-foreground">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              initial={reduce ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? undefined : { y: -8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 42 }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
    </Link>
  );
}

function AuthControl() {
  // null = unknown; render nothing rather than flash the wrong control.
  // Same client-side pattern as components/auth-button.tsx and for the same
  // reason: this chrome wraps statically generated pages.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  if (signedIn === null) return null;

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }

  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-foreground"
      >
        Sign out
      </button>
    </form>
  );
}
