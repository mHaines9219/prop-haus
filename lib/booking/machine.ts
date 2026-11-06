/**
 * One house's booking on an order, as a state machine.
 *
 *   inquiry_sent ──confirm──▶ confirmed ──issue_coi──▶ coi_issued ──place_hold──▶ hold_placed ──capture──▶ captured
 *        │                                                 ▲                          │                       │
 *        └──decline──▶ declined                            └───────expire_hold────────┘                 charge_extra ↺
 *
 * The card is saved once per order at checkout, with no charge. Everything
 * after that happens per house: a house that confirms gets its own
 * certificate and its own hold, and the hold is captured and paid out at
 * pickup. Pure module: the table below is the only place a stage change is
 * decided, and both the server and the order page read it.
 */

import type { OrderStatus } from '../orders';
import type { Certificate } from '../insurance/issuer';
import type { BookingInsurance, InsuranceRoute } from '../insurance/route';
import { HOLD_LIFETIME_DAYS, type Capture, type ExtraCharge, type ExtraKind, type Hold } from '../payments/provider';

export const BOOKING_STAGES = ['inquiry_sent', 'confirmed', 'coi_issued', 'hold_placed', 'captured', 'declined'] as const;
export type BookingStage = (typeof BOOKING_STAGES)[number];

export const BOOKING_EVENTS = [
  'confirm',
  'decline',
  'issue_coi',
  'receive_coi',
  'attach_coi',
  'place_hold',
  'expire_hold',
  'capture',
  'charge_extra',
] as const;
export type BookingEventType = (typeof BOOKING_EVENTS)[number];

const TRANSITIONS: Record<BookingStage, Partial<Record<BookingEventType, BookingStage>>> = {
  inquiry_sent: { confirm: 'confirmed', decline: 'declined' },
  confirmed: { issue_coi: 'coi_issued', receive_coi: 'coi_issued', attach_coi: 'coi_issued' },
  coi_issued: { place_hold: 'hold_placed' },
  hold_placed: { capture: 'captured', expire_hold: 'coi_issued' },
  captured: { charge_extra: 'captured' },
  declined: {},
};

/**
 * How a confirmed house gets its certificate, by insurance route: the fallback
 * insurer issues one, the production's own broker sends one, or the one on
 * file is attached. One of the three, decided by the route, never a choice.
 */
export const CERTIFICATE_EVENT: Record<InsuranceRoute, BookingEventType> = {
  athos: 'issue_coi',
  own: 'receive_coi',
  on_file: 'attach_coi',
};

const CERTIFICATE_EVENTS = new Set<BookingEventType>(Object.values(CERTIFICATE_EVENT));

/** The stage an event leads to, or null when the booking cannot take that event now. */
export function nextStage(stage: BookingStage, event: BookingEventType, route: InsuranceRoute): BookingStage | null {
  if (CERTIFICATE_EVENTS.has(event) && event !== CERTIFICATE_EVENT[route]) return null;
  return TRANSITIONS[stage][event] ?? null;
}

/** What can happen to a booking at this stage, the forward step first. */
export function availableEvents(stage: BookingStage, route: InsuranceRoute): BookingEventType[] {
  return (Object.keys(TRANSITIONS[stage]) as BookingEventType[]).filter(
    (event) => !CERTIFICATE_EVENTS.has(event) || event === CERTIFICATE_EVENT[route],
  );
}

/** The stages a booking passes through when nothing goes wrong, in order. */
export const HAPPY_PATH: BookingStage[] = ['inquiry_sent', 'confirmed', 'coi_issued', 'hold_placed', 'captured'];

export const PACKET_KINDS = ['info_sheet', 'w9', 'payment_on_file', 'insurability'] as const;
export type PacketKind = (typeof PACKET_KINDS)[number];

/** One piece of the inquiry packet a house receives. `line` is the sentence the email prints. */
export type PacketItem = {
  kind: PacketKind;
  label: string;
  status: 'included' | 'to_follow';
  line: string;
};

export type BookingHistoryEntry = {
  event: BookingEventType | 'open';
  from: BookingStage | null;
  to: BookingStage;
  at: string;
};

/** Everything the stages have produced so far. Stored as order_bookings.state. */
export type BookingState = {
  packet: PacketItem[];
  /** How this house gets its certificate (lib/insurance/route.ts). */
  insurance: BookingInsurance;
  /** The certificate request written to the production's broker on confirmation (`own` route). */
  coiRequest?: { to?: string; writtenAt: string };
  /** The house's confirmed total. Set when it confirms. */
  amountCents?: number;
  declineNote?: string;
  certificate?: Certificate;
  /** The live authorization. Cleared when it lapses, kept once captured. */
  hold?: Hold;
  capture?: Capture;
  extras: ExtraCharge[];
  history: BookingHistoryEntry[];
};

export type Booking = BookingState & {
  id: string;
  orderId: string;
  vendorId: string;
  vendorName: string;
  stage: BookingStage;
  createdAt: string;
  updatedAt: string;
};

/** What the caller supplies with an event. Only the fields that event reads are used. */
export type BookingEventInput = {
  event: BookingEventType;
  /** confirm: the house's total. charge_extra: the charge. */
  amountCents?: number;
  /** decline: the house's reason. charge_extra: what it is for. */
  note?: string;
  /** charge_extra only. */
  kind?: ExtraKind;
};

// PLACEHOLDER: the platform fee is undecided. 10% of each house's total, taken
// from the house's payout, is a stand-in so the split has numbers to show.
export const PLATFORM_FEE_BPS = 1000;

export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
}

// PLACEHOLDER: catalog lines rarely carry a price, so a house's total has no
// source until it quotes. The sandbox prefills this much per unpriced line.
export const UNPRICED_LINE_CENTS = 15_000;

/** The total the sandbox offers when a house confirms: listed prices, a stand-in for the rest. */
export function suggestedAmountCents(lines: { priceCents?: number }[]): number {
  return lines.reduce((sum, l) => sum + (l.priceCents ?? UNPRICED_LINE_CENTS), 0);
}

export type HoldPlan = { when: 'now' } | { when: 'later'; placeOn: string };

/**
 * When a house's hold should go on the card. A hold lapses after about a week,
 * so one placed too early is gone before pickup: a confirmation that lands far
 * out waits until the pickup date is inside the hold's lifetime.
 */
export function holdPlan(rentalStart: string | undefined, today: string): HoldPlan {
  if (!rentalStart) return { when: 'now' };
  const placeOn = addDays(rentalStart, -(HOLD_LIFETIME_DAYS - 1));
  return placeOn <= today ? { when: 'now' } : { when: 'later', placeOn };
}

/**
 * The order's own status, read off its houses. Placed until a house answers,
 * processing while any is still to answer, confirmed once every house has
 * (and at least one said yes), cancelled when they all declined.
 */
export function orderStatusFor(stages: BookingStage[]): OrderStatus {
  if (stages.length === 0 || stages.every((s) => s === 'inquiry_sent')) return 'placed';
  if (stages.every((s) => s === 'declined')) return 'cancelled';
  if (stages.some((s) => s === 'inquiry_sent')) return 'processing';
  return 'confirmed';
}

export type ReceiptLine = {
  vendorId: string;
  vendorName: string;
  label: string;
  amountCents: number;
};

export type Receipt = {
  lines: ReceiptLine[];
  /** What the production's card was charged, all houses together. */
  chargedCents: number;
  /** What Prop Haus kept. */
  feeCents: number;
  /** What the houses were paid. */
  payoutCents: number;
};

/** The one receipt for the whole order: every capture and every later charge, across houses. */
export function receiptFor(bookings: Pick<Booking, 'vendorId' | 'vendorName' | 'capture' | 'extras'>[]): Receipt | null {
  const lines: ReceiptLine[] = [];
  let feeCents = 0;
  for (const b of bookings) {
    if (!b.capture) continue;
    lines.push({ vendorId: b.vendorId, vendorName: b.vendorName, label: 'Rental', amountCents: b.capture.amountCents });
    feeCents += b.capture.feeCents;
    for (const extra of b.extras) {
      lines.push({
        vendorId: b.vendorId,
        vendorName: b.vendorName,
        label: EXTRA_LABEL[extra.kind],
        amountCents: extra.amountCents,
      });
    }
  }
  if (lines.length === 0) return null;
  const chargedCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  return { lines, chargedCents, feeCents, payoutCents: chargedCents - feeCents };
}

export const EXTRA_LABEL: Record<ExtraKind, string> = {
  damage: 'Damage',
  loss: 'Loss',
  late_fee: 'Late fee',
};

export const STAGE_LABEL: Record<BookingStage, string> = {
  inquiry_sent: 'Inquiry out',
  confirmed: 'Confirmed',
  coi_issued: 'COI issued',
  hold_placed: 'Hold placed',
  captured: 'Picked up',
  declined: 'Declined',
};

export const EVENT_LABEL: Record<BookingEventType, string> = {
  confirm: 'House confirms',
  decline: 'House declines',
  issue_coi: 'ATHOS issues COI',
  receive_coi: "Broker's COI arrives",
  attach_coi: 'Attach COI on file',
  place_hold: 'Place hold',
  expire_hold: 'Let hold lapse',
  capture: 'Pickup: capture and pay out',
  charge_extra: 'Add a charge',
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
