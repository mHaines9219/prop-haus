'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Tooltip — a short explanation that appears on hover or keyboard focus.
 *
 * Dependency-free: the trigger is a focusable inline span that names the
 * tooltip through aria-describedby, and the tooltip itself is always in the
 * DOM (hidden with opacity) so readers announce it with the trigger. It
 * renders through a portal, fixed to the viewport, so a scrolling or clipping
 * ancestor never cuts it off. Content is a sentence or two, never controls.
 * Put a visible label on the trigger when the wrapped content is an icon alone.
 */
const SIDE = {
  top: '-translate-x-1/2 -translate-y-full',
  right: '-translate-y-1/2',
} as const;

const GAP = 8;

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
  /** Where the tooltip opens. */
  side?: keyof typeof SIDE;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<CSSProperties | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function show() {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    setAnchor(
      side === 'top'
        ? { top: r.top - GAP, left: r.left + r.width / 2 }
        : { top: r.top + r.height / 2, left: r.right + GAP },
    );
  }
  function hide() {
    setAnchor(null);
  }

  return (
    <span
      ref={trigger}
      tabIndex={0}
      aria-label={label}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={() => trigger.current?.matches(':focus-visible') && show()}
      onBlur={hide}
      className={cn(
        'inline-flex items-center rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
        className,
      )}
    >
      {children}
      {mounted &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={anchor ?? undefined}
            className={cn(
              'pointer-events-none fixed z-50 w-max max-w-[240px] border border-border bg-popover px-2.5 py-1.5 text-left text-[12px] font-normal normal-case leading-[16px] tracking-normal text-text-secondary opacity-0 shadow-[var(--shadow-overlay)] transition-opacity duration-150',
              anchor && 'opacity-100',
              SIDE[side],
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
