'use client';

import Link from 'next/link';
import { Menu, ShoppingCart, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-store';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from './theme-toggle';

const NAV = [
  { label: 'How it works', href: '/#how' },
  { label: 'Crew', href: '/crew' },
  { label: 'Dashboard', href: '/projects' },
];

/**
 * Party Line nav (DESIGN.md §9.1): the binder's top edge. Always green vinyl,
 * whatever the theme. The wordmark is a cream index tab, the city a coral
 * one, like the "Fire 273-3110" tabs along the top of the reference page.
 * Links are cream condensed gothic, flush right.
 */
export function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-binder text-paper">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center px-3 sm:px-5">
        {/* Index tabs — flush left */}
        <div className="mr-auto flex items-stretch gap-1.5">
          <Link
            href="/"
            className="flex items-center border-[1.5px] border-ink bg-paper-lit px-2.5 font-heading text-[15px] font-extrabold uppercase leading-none tracking-[0.01em] text-ink transition-colors duration-150 hover:bg-white"
          >
            Prop Haus
          </Link>
          <span
            aria-hidden
            className="hidden items-center border-[1.5px] border-ink bg-coral px-2.5 font-heading text-[12px] font-extrabold uppercase leading-none tracking-[0.04em] text-ink sm:flex"
          >
            Los Angeles
          </span>
        </div>

        {/* Nav links + icons — flush right */}
        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-5 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="font-heading text-[13px] font-bold uppercase tracking-[0.05em] text-paper/85 underline-offset-[5px] transition-colors duration-150 hover:text-white hover:underline"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <ThemeToggle />
          <CartLink />
          <AuthControl />
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="text-paper/85 transition-colors duration-150 hover:text-white md:hidden"
          >
            {menuOpen ? <X size={19} strokeWidth={1.75} aria-hidden /> : <Menu size={19} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>
      </div>
      {/* Bottom rule of the binder edge */}
      <div aria-hidden className="h-px w-full bg-ink/60" />
      {menuOpen && (
        <nav className="border-b border-ink/60 bg-binder md:hidden">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col px-3 py-2 sm:px-5">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="py-2.5 font-heading text-[13px] font-bold uppercase tracking-[0.05em] text-paper/85 underline-offset-[5px] transition-colors duration-150 hover:text-white hover:underline"
              >
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
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
      className="relative text-paper/85 transition-colors duration-150 hover:text-white"
    >
      <ShoppingCart size={19} strokeWidth={1.75} aria-hidden />
      {count > 0 && (
        <span className="absolute -right-2.5 -top-2 flex h-[17px] min-w-[17px] items-center justify-center overflow-hidden rounded-full border border-ink bg-accent px-1 font-heading text-[10px] font-extrabold leading-none text-accent-foreground">
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

  return (
    <Link
      href={signedIn ? '/account' : '/login'}
      aria-label="Your account"
      className="text-paper/85 transition-colors duration-150 hover:text-white"
    >
      <svg width="19" height="19" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="9" cy="6" r="3" />
        <path d="M3.5 15.5c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
