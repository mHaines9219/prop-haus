'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * The ruled contact sheet (DESIGN.md sections 6, 9.3): grid cells share single
 * 1px hairline seams edge-to-edge with zero gutters, implemented as a 1px grid
 * gap over a border-colored track rather than per-card borders that double up.
 * Shared by the browse grid, search results, category pages, and related rows.
 */
export function SeamGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-3 xl:grid-cols-4 min-[1680px]:grid-cols-5">
      {children}
    </div>
  );
}

// The batch size a stagger runs across before repeating; keeps appended pages
// from delaying later cells by a growing offset.
const STAGGER_SPAN = 24;
const STAGGER_CAP = 12;

/**
 * grid-arrive (DESIGN.md section 8): light comes up per cell, never flies in.
 * `index` is the item's position in the flat list; the modulo keeps the stagger
 * bounded so infinite-scroll appends animate in their own wave.
 * `marquee`: spans 2×2 in the grid (home page lead frame, DESIGN.md v1.1 §9.2).
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
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 380,
        damping: 34,
        delay: Math.min(index % STAGGER_SPAN, STAGGER_CAP) * 0.04,
      }}
      className={cn('bg-background', marquee && 'col-span-2 row-span-2')}
    >
      {children}
    </motion.div>
  );
}
