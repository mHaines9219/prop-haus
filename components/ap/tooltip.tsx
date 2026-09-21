'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tooltip — a short explanation that appears on hover or keyboard focus.
 *
 * Dependency-free: the trigger is a focusable inline span that names the
 * tooltip through aria-describedby, and the tooltip itself is always in the
 * DOM (hidden with opacity) so readers announce it with the trigger. Content
 * is a sentence or two, never controls. Put a visible label on the trigger
 * when the wrapped content is an icon alone.
 */
const SIDE = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
} as const;

export function Tooltip({
  content,
  label,
  side = 'top',
  children,
  className,
}: {
  content: ReactNode;
  /** Accessible name for the trigger when children are decorative (an icon). */
  label?: string;
  /** Where the tooltip opens. Use `right` inside scroll containers that would clip one opening upward. */
  side?: keyof typeof SIDE;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <span
      tabIndex={0}
      aria-label={label}
      aria-describedby={id}
      className={cn(
        'group/tip relative inline-flex items-center rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute z-20 w-max max-w-[240px] border border-border bg-popover px-2.5 py-1.5 text-left text-[12px] font-normal normal-case leading-[16px] tracking-normal text-text-secondary opacity-0 shadow-[var(--shadow-overlay)] transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100',
          SIDE[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
