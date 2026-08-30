'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-store';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { label: 'How it works', href: '/#how' },
  { label: 'Crew', href: '/crew' },
  { label: 'Pulls', href: '/projects' },
];

/**
 * Nocturne nav: wordmark flush left, all links + icons flush right.
 * No center-aligned nav — the template layout keeps everything on one side.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 h-14 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center px-4 sm:px-6">
        {/* Wordmark — flush left */}
        <Link href="/" className="mr-auto flex items-baseline gap-2.5">
          <span className="font-heading text-[18px] font-bold uppercase leading-none tracking-[0.04em] text-foreground">
            Prop Haus
          </span>
        </Link>

        {/* Nav links + icons — flush right */}
        <div className="flex items-center gap-6">
          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="font-heading text-[13px] font-bold tracking-[-0.028em] text-text-secondary transition-colors duration-150 hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <ThemeToggle />
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? lines.length : 0;

  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? `Cart, ${count} items` : 'Cart'}
      className="relative text-text-secondary transition-colors duration-150 hover:text-foreground"
    >
      <ShoppingCart size={18} strokeWidth={1.5} aria-hidden />
      {count > 0 && (
        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center overflow-hidden rounded-full bg-accent px-1 font-mono text-[10px] font-medium leading-none text-accent-foreground">
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
        aria-label="Your account"
        className="text-text-secondary transition-colors duration-150 hover:text-foreground"
      >
        {/* User icon — matches the template's account mark */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="9" cy="6" r="3" />
          <path d="M3.5 15.5c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" strokeLinecap="round" />
        </svg>
      </Link>
    );
  }

  return (
    <Link
      href="/account/insurance"
      aria-label="Your account"
      className="text-text-secondary transition-colors duration-150 hover:text-foreground"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="9" cy="6" r="3" />
        <path d="M3.5 15.5c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
