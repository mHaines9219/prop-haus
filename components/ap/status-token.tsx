import { cn } from '@/lib/utils';

/**
 * StatusToken — the one status chip for the whole app (DESIGN.md §9.10, §13).
 *
 * A listing bullet + an 11px condensed uppercase label inside an ink rule.
 * The bullet is the "•" from "FERTILIZER • CHEMICALS • LIME", colored by
 * status. Dots exist ONLY inside a token, never free-floating. Every status
 * surface (orders, line items, crew requests) maps its domain status onto one
 * of the four canonical tones with the helpers below.
 *
 * The four tones read from the live `--status-*` tokens in globals.css
 * (bg-status-*), which are defined in both the binder and sheet scopes.
 */

export type StatusTone = 'pending' | 'quoted' | 'confirmed' | 'unavailable';

/** The dot class per tone. Exported for controls that render a token-shaped dot (JobStatusSelect). */
export const TONE_DOT: Record<StatusTone, string> = {
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
        'inline-flex items-center gap-1.5 border border-border-strong bg-card px-2 py-[3px]',
        className,
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[tone])} />
      <span className="font-mono text-[11px] font-bold uppercase leading-none tracking-[0.06em] text-foreground">
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

/**
 * orders.job_status — the user's own board status (active/pending/done). Active
 * reads as standby amber (in motion, the user's attention is on it), pending as
 * grey (parked), done as go green.
 */
export function jobStatusSpec(status: string): TokenSpec {
  switch (status) {
    case 'active':
      return { tone: 'quoted', label: 'ACTIVE' };
    case 'done':
      return { tone: 'confirmed', label: 'DONE' };
    default:
      return { tone: 'pending', label: 'PENDING' };
  }
}

/** order_documents.status — filled/awaiting_signature/signed/manual/failed/skipped. */
export function documentStatusSpec(status: string): TokenSpec {
  switch (status) {
    case 'filled':
      return { tone: 'confirmed', label: 'FILLED' };
    case 'awaiting_signature':
      return { tone: 'quoted', label: 'SIGN NEEDED' };
    case 'signed':
      return { tone: 'confirmed', label: 'SIGNED' };
    case 'manual':
      return { tone: 'pending', label: 'MANUAL' };
    case 'failed':
      return { tone: 'unavailable', label: 'UNAVAILABLE' };
    default:
      return { tone: 'pending', label: 'PENDING' };
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

/**
 * Paperwork checklist items — status × how the document comes to exist. Missing
 * reads as what to do next (upload, template ready, external, at checkout);
 * complete is CONFIRMED; needs information and a ready template stand by.
 */
export function checklistStatusSpec(status: string, fulfillment: string): TokenSpec {
  switch (status) {
    case 'complete':
      return { tone: 'confirmed', label: 'COMPLETE' };
    case 'not_applicable':
      return { tone: 'pending', label: 'N/A' };
    case 'needs_information':
      return { tone: 'quoted', label: 'NEEDS INFO' };
    case 'awaiting':
      return { tone: 'pending', label: 'REQUESTED' };
    default:
      switch (fulfillment) {
        case 'template':
          return { tone: 'quoted', label: 'TEMPLATE READY' };
        case 'external':
          return { tone: 'pending', label: 'EXTERNAL' };
        case 'track':
          return { tone: 'pending', label: 'AT CHECKOUT' };
        default:
          return { tone: 'pending', label: 'UPLOAD' };
      }
  }
}

/** outbound_messages.status — sending/sent/failed. */
export function messageStatusSpec(status: string): TokenSpec {
  switch (status) {
    case 'sent':
      return { tone: 'confirmed', label: 'SENT' };
    case 'failed':
      return { tone: 'unavailable', label: 'FAILED' };
    default:
      return { tone: 'pending', label: 'SENDING' };
  }
}
