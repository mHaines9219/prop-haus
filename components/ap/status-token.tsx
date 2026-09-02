import { cn } from '@/lib/utils';

/**
 * StatusToken — the one status chip for the whole app (DESIGN.md §9.10, §13).
 *
 * A 6px semantic dot + 11px mono uppercase label inside a hairline pill. Dots
 * exist ONLY inside a token, never free-floating. Every status surface (orders,
 * line items, crew requests) maps its domain status onto one of the four
 * canonical tones with the helpers below, so the color language stays uniform.
 *
 * The four tones read from the live `--status-*` tokens in globals.css
 * (bg-status-*), not from hard-coded hex — the source of truth is the theme.
 */

export type StatusTone = 'pending' | 'quoted' | 'confirmed' | 'unavailable';

const TONE_DOT: Record<StatusTone, string> = {
  pending: 'bg-status-pending',
  quoted: 'bg-status-quoted',
  confirmed: 'bg-status-confirmed',
  unavailable: 'bg-status-unavailable',
};

export function StatusToken({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border border-border px-2 py-[3px]',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[tone])} />
      <span className="font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-text-secondary">
        {label}
      </span>
    </span>
  );
}

// ── domain → token mappings ────────────────────────────────────────────────
// Each surface has its own status vocabulary; these collapse them onto the four
// shared tones so the dashboard, the order pages, and the ledger all agree.

type TokenSpec = { tone: StatusTone; label: string };

/** order_items.status — already the canonical four. */
export function itemStatusSpec(status: string): TokenSpec {
  switch (status) {
    case 'quoted':
      return { tone: 'quoted', label: 'QUOTED' };
    case 'confirmed':
      return { tone: 'confirmed', label: 'CONFIRMED' };
    case 'unavailable':
      return { tone: 'unavailable', label: 'UNAVAILABLE' };
    default:
      return { tone: 'pending', label: 'PENDING' };
  }
}

/** orders.status — placed/processing/confirmed/cancelled. */
export function orderStatusSpec(status: string): TokenSpec {
  switch (status) {
    case 'processing':
      return { tone: 'pending', label: 'PROCESSING' };
    case 'confirmed':
      return { tone: 'confirmed', label: 'CONFIRMED' };
    case 'cancelled':
      return { tone: 'unavailable', label: 'CANCELLED' };
    default:
      return { tone: 'pending', label: 'PLACED' };
  }
}

/** crew_requests.status — requested/confirmed/declined. */
export function crewStatusSpec(status: string): TokenSpec {
  switch (status) {
    case 'confirmed':
      return { tone: 'confirmed', label: 'CONFIRMED' };
    case 'declined':
      return { tone: 'unavailable', label: 'DECLINED' };
    default:
      return { tone: 'pending', label: 'REQUESTED' };
  }
}
