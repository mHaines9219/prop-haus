'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, postJson } from '@/lib/api';
import {
  EVENT_LABEL,
  EXTRA_LABEL,
  HAPPY_PATH,
  STAGE_LABEL,
  availableEvents,
  holdPlan,
  receiptFor,
  type Booking,
  type BookingEventInput,
  type BookingEventType,
} from '@/lib/booking/machine';
import { EXTRA_KINDS, type ExtraKind, type SavedCard } from '@/lib/payments/provider';
import { issuerLabel } from '@/lib/insurance/route';
import { StatusToken, bookingStageSpec } from '@/components/ap/status-token';
import { cn } from '@/lib/utils';

/**
 * The booking flow on an order page: one box per house, time running left to
 * right. Each box has the three lanes of the flow (money, paperwork,
 * messages) and, on a sandbox order, the buttons that move that house to its
 * next stage by hand. One receipt for the whole order prints underneath once
 * anything is captured.
 */
export function BookingFlow({
  orderId,
  bookings,
  card,
  sandbox,
  canAdvance,
  rentalStart,
  today,
  suggestedCents,
}: {
  orderId: string;
  bookings: Booking[];
  card?: SavedCard;
  /** The order was placed in the sandbox: its inquiries were written, not sent. */
  sandbox: boolean;
  /** Show the manual-advance buttons: a sandbox order, seen by an admin. */
  canAdvance: boolean;
  rentalStart?: string;
  /** ISO date, from the server, so the hold plan reads the same on both renders. */
  today: string;
  /** What to prefill as each house's total when it confirms, by vendor id. */
  suggestedCents: Record<string, number>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ vendorId: string; message: string } | null>(null);

  if (bookings.length === 0) return null;

  async function advance(vendorId: string, input: BookingEventInput) {
    setBusy(vendorId);
    setError(null);
    try {
      await postJson(`/api/orders/${orderId}/bookings/${vendorId}`, input);
      router.refresh();
    } catch (err) {
      setError({ vendorId, message: err instanceof ApiError ? err.message : 'That did not go through. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  const cardLabel = card ? `${card.brand} ···· ${card.last4}` : 'No card saved';
  const receipt = receiptFor(bookings);

  return (
    <section className="mb-8" aria-label="Booking">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
        <h2 className="font-heading text-[15px] font-bold tracking-[-0.02em]">Booking</h2>
        <p className="font-mono text-[12px] text-text-tertiary">
          {card ? `Card saved: ${cardLabel}. No charge until pickup.` : cardLabel}
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {bookings.map((b) => (
          <HouseBox
            key={b.id}
            booking={b}
            cardLabel={cardLabel}
            rentalStart={rentalStart}
            today={today}
            sandbox={sandbox}
            canAdvance={canAdvance}
            busy={busy === b.vendorId}
            error={error?.vendorId === b.vendorId ? error.message : null}
            suggestedCents={suggestedCents[b.vendorId] ?? 0}
            onAdvance={(input) => void advance(b.vendorId, input)}
          />
        ))}
      </div>

      {receipt && (
        <div className="mt-4 border border-border bg-surface-raised p-5" aria-label="Receipt">
          <p className={EYEBROW}>Receipt</p>
          <ul className="mt-3 divide-y divide-border font-mono text-[13px]">
            {receipt.lines.map((l, i) => (
              <li key={`${l.vendorId}-${i}`} className="flex items-baseline justify-between gap-4 py-2">
                <span>
                  {l.vendorName}
                  <span className="text-text-tertiary"> · {l.label}</span>
                </span>
                <span className="tabular-nums">{usd(l.amountCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-border-strong pt-3 font-mono text-[13px]">
            <Total label={`Charged to ${cardLabel}`} cents={receipt.chargedCents} strong />
            <Total label="Paid to the houses" cents={receipt.payoutCents} />
            <Total label="Prop Haus fee" cents={receipt.feeCents} />
          </dl>
        </div>
      )}
    </section>
  );
}

const EYEBROW = 'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary';
const BUTTON =
  'border border-border px-3 py-2 font-mono text-[12px] text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY =
  'border border-foreground px-3 py-2 font-mono text-[12px] font-medium text-foreground lift-sm hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50';
const FIELD =
  'h-[34px] border border-border bg-background px-2 font-mono text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground';

function HouseBox({
  booking,
  cardLabel,
  rentalStart,
  today,
  sandbox,
  canAdvance,
  busy,
  error,
  suggestedCents,
  onAdvance,
}: {
  booking: Booking;
  cardLabel: string;
  rentalStart?: string;
  today: string;
  sandbox: boolean;
  canAdvance: boolean;
  busy: boolean;
  error: string | null;
  suggestedCents: number;
  onAdvance: (input: BookingEventInput) => void;
}) {
  return (
    <article className="border border-border bg-surface-raised p-5" aria-label={booking.vendorName}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-[15px] font-bold tracking-[-0.02em]">{booking.vendorName}</h3>
        <StatusToken {...bookingStageSpec(booking.stage)} />
      </div>

      <Rail booking={booking} />

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 font-mono text-[12px] leading-[18px] sm:grid-cols-[92px_1fr]">
        <dt className={EYEBROW}>Money</dt>
        <dd className="space-y-0.5">
          {moneyLines(booking, cardLabel, rentalStart, today).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </dd>
        <dt className={EYEBROW}>Paperwork</dt>
        <dd className="space-y-0.5">
          {paperworkLines(booking).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </dd>
        <dt className={EYEBROW}>Messages</dt>
        <dd className="space-y-0.5">
          {messageLines(booking, sandbox).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </dd>
      </dl>

      {canAdvance && (
        <SandboxActions
          booking={booking}
          busy={busy}
          suggestedCents={suggestedCents}
          onAdvance={onAdvance}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 font-mono text-[12px] text-accent-text">
          {error}
        </p>
      )}
    </article>
  );
}

/** The five stages left to right; what is behind the booking is filled in. */
function Rail({ booking }: { booking: Booking }) {
  const reached = booking.stage === 'declined' ? 0 : HAPPY_PATH.indexOf(booking.stage);
  return (
    <ol className="mt-4 flex overflow-x-auto border border-border-strong" aria-label="Stages">
      {HAPPY_PATH.map((stage, i) => {
        const done = booking.stage !== 'declined' && i <= reached;
        const current = booking.stage !== 'declined' && i === reached;
        return (
          <li
            key={stage}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'min-w-[104px] flex-1 border-l border-border-strong px-3 py-2 first:border-l-0',
              done ? 'bg-card text-foreground' : 'text-text-tertiary',
            )}
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('h-2 w-2 shrink-0 rounded-full', done ? 'bg-status-confirmed' : 'bg-status-pending')}
              />
              <span className="font-heading text-[11px] font-extrabold uppercase leading-none tracking-[0.06em]">
                {STAGE_LABEL[stage]}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SandboxActions({
  booking,
  busy,
  suggestedCents,
  onAdvance,
}: {
  booking: Booking;
  busy: boolean;
  suggestedCents: number;
  onAdvance: (input: BookingEventInput) => void;
}) {
  const events = availableEvents(booking.stage, booking.insurance.route);
  const [dollars, setDollars] = useState(() => (suggestedCents / 100).toFixed(2));
  const [extraDollars, setExtraDollars] = useState('');
  const [kind, setKind] = useState<ExtraKind>('damage');

  if (events.length === 0) {
    return (
      <p className="mt-4 border-t border-dashed border-border-strong pt-3 font-mono text-[12px] text-text-tertiary">
        Nothing further for this house.
      </p>
    );
  }

  function inputFor(event: BookingEventType): BookingEventInput {
    if (event === 'confirm') return { event, amountCents: toCents(dollars) };
    if (event === 'charge_extra') return { event, kind, amountCents: toCents(extraDollars) };
    return { event };
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-border-strong pt-3">
      <span className={EYEBROW}>Sandbox</span>
      {events.includes('confirm') && (
        <label className="flex items-center gap-1.5 font-mono text-[12px] text-text-secondary">
          House total $
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            aria-label={`${booking.vendorName} total in dollars`}
            className={cn(FIELD, 'w-[92px] tabular-nums')}
          />
        </label>
      )}
      {events.includes('charge_extra') && (
        <>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ExtraKind)}
            aria-label="What the charge is for"
            className={FIELD}
          >
            {EXTRA_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXTRA_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 font-mono text-[12px] text-text-secondary">
            $
            <input
              inputMode="decimal"
              value={extraDollars}
              onChange={(e) => setExtraDollars(e.target.value)}
              placeholder="0.00"
              aria-label="Charge amount in dollars"
              className={cn(FIELD, 'w-[92px] tabular-nums')}
            />
          </label>
        </>
      )}
      {events.map((event, i) => (
        <button
          key={event}
          type="button"
          disabled={busy}
          onClick={() => onAdvance(inputFor(event))}
          className={i === 0 ? PRIMARY : BUTTON}
        >
          {EVENT_LABEL[event]}
        </button>
      ))}
    </div>
  );
}

function Total({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', strong ? 'font-medium text-foreground' : 'text-text-secondary')}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{usd(cents)}</dd>
    </div>
  );
}

// ---- the three lanes, as sentences ----

function moneyLines(b: Booking, cardLabel: string, rentalStart: string | undefined, today: string): string[] {
  const total = b.amountCents !== undefined ? usd(b.amountCents) : '';
  switch (b.stage) {
    case 'inquiry_sent':
      return ['Card saved. No charge, no hold.'];
    case 'declined':
      return ['Nothing held, nothing charged.'];
    case 'confirmed':
      return [`Total ${total}. No hold yet: the certificate comes first.`];
    case 'coi_issued': {
      const plan = holdPlan(rentalStart, today);
      return [
        plan.when === 'now'
          ? `Hold of ${total} is due now.`
          : `Hold of ${total} is due ${day(plan.placeOn)}. A hold lasts about 7 days, so it waits until pickup is that close.`,
      ];
    }
    case 'hold_placed':
      return b.hold ? [`Hold of ${usd(b.hold.amountCents)} on ${cardLabel}. Lapses ${day(b.hold.expiresAt)}.`] : [];
    case 'captured': {
      if (!b.capture) return [];
      return [
        `Captured ${usd(b.capture.amountCents)}. ${usd(b.capture.payoutCents)} paid to ${b.vendorName}, ${usd(b.capture.feeCents)} fee.`,
        ...b.extras.map((x) => `${EXTRA_LABEL[x.kind]}: ${usd(x.amountCents)} charged to ${cardLabel}.`),
      ];
    }
  }
}

function paperworkLines(b: Booking): string[] {
  const packet = b.packet.map((p) => (p.status === 'to_follow' ? `${p.label} (to follow)` : p.label)).join(' · ');
  const lines = [`Inquiry packet: ${packet}.`, `Certificate route: ${routeLine(b)}`];
  if (b.coiRequest) {
    lines.push(
      `Certificate request to ${b.coiRequest.to ?? 'the broker'} written ${moment(b.coiRequest.writtenAt)}. Not sent (sandbox).`,
    );
  }
  const c = b.certificate;
  if (c) {
    const verb = b.insurance.route === 'on_file' ? 'on file' : `issued by ${c.issuer}`;
    lines.push(
      `COI ${c.certificateNumber} ${verb}, naming ${c.holderName}. ${usd(c.glLimit * 100, 0)} per occurrence, ${usd(c.aggregateLimit * 100, 0)} aggregate. ${coverage(c.coverageStart, c.coverageEnd)}`,
      c.additionalInsuredWording,
    );
  } else if (b.stage === 'confirmed') {
    lines.push(
      b.insurance.route === 'on_file'
        ? 'COI is next: the one on file is attached to this house.'
        : `COI is next: ${issuerLabel(b.insurance)} sends one naming this house.`,
    );
  } else if (b.stage === 'declined') {
    lines.push('No certificate issued.');
  }
  return lines;
}

/** "own broker, Acme Insurance (acme@x.com)" / "COI on file, Nocturne-COI.pdf" / "ATHOS, the fallback insurer". */
function routeLine(b: Booking): string {
  const i = b.insurance;
  switch (i.route) {
    case 'on_file':
      return `COI on file${i.documentName ? `, ${i.documentName}` : ''}.`;
    case 'own':
      return `the production's own policy${i.brokerName ? `, broker ${i.brokerName}` : ''}${i.brokerEmail ? ` (${i.brokerEmail})` : ''}.`;
    case 'athos':
      return `${issuerLabel(i)}, the fallback insurer. Nothing on file.`;
  }
}

function coverage(start?: string, end?: string): string {
  if (start && end) return `Covers ${day(start)} to ${day(end)}.`;
  return 'Coverage dates follow the rental window once it is set.';
}

function messageLines(b: Booking, sandbox: boolean): string[] {
  const lines = [sandbox ? 'Inquiry written and kept on this order. Not sent.' : 'Inquiry sent.'];
  if (b.declineNote) lines.push(`Declined: ${b.declineNote}`);
  const last = b.history[b.history.length - 1];
  if (last && last.event !== 'open') lines.push(`Last step: ${EVENT_LABEL[last.event]}, ${moment(last.at)}.`);
  return lines;
}

function usd(cents: number, fractionDigits = 2): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Dollars typed by hand to whole cents; anything unreadable is 0, which the server refuses. */
function toCents(dollars: string): number {
  const n = Number(dollars.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Fixed zone: the server and the browser must print the same string.
const ZONE = 'America/Los_Angeles';

function day(iso: string): string {
  const date = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: iso.length === 10 ? 'UTC' : ZONE });
}

function moment(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ZONE,
  });
}
