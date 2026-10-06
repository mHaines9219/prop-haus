'use client';

import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * The page paste-up (DESIGN.md §8): every page is set onto the binder the
 * way an ad is pasted onto the sheet: it fades in and settles down 10px.
 * Keyed on the pathname so the entrance replays on every navigation, even
 * when the App Router keeps the segment mounted. Entrance only; the router
 * swaps pages too fast for an exit to read as anything but a stall.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={pathname ?? 'page'}
      data-slot="page-transition"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex min-w-0 flex-1 flex-col', className)}
    >
      {children}
    </motion.div>
  );
}
