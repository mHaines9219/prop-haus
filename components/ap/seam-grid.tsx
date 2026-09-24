'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * The page of ads (DESIGN.md §6, §9.3): ad boxes in columns with a narrow
 * gutter between them, the way the reference page is laid out. Each box
 * carries its own ink rule (ItemCard), so the grid draws no seams of its own.
 * Shared by the browse grid, search results, category pages, and related rows.
 */
export function SeamGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-4 min-[1680px]:grid-cols-5">
      {children}
    </div>
  );
}

// The batch size a stagger runs across before repeating; keeps appended pages
// from delaying later cells by a growing offset.
const STAGGER_SPAN = 24;
const STAGGER_CAP = 12;

/**
 * grid-arrive (DESIGN.md §8): each ad is pasted up in turn, never flies in.
 * `index` is the item's position in the flat list; the modulo keeps the stagger
 * bounded so infinite-scroll appends animate in their own wave.
 * `marquee`: spans 2×2 in the grid (the page's big ad).
 */
export function GridCell({
  index,
  children,
  marquee,
}: {
  index: number;
  children: React.ReactNode;
  marquee?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 380,
        damping: 34,
        delay: Math.min(index % STAGGER_SPAN, STAGGER_CAP) * 0.035,
      }}
      className={cn('bg-card', marquee && 'col-span-2 row-span-2')}
    >
      {children}
    </motion.div>
  );
}
