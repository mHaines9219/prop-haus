/**
 * Bookings in the database: opened at checkout, advanced one event at a time.
 * Server only.
 *
 * Today only a sandbox order has bookings, and only a person advances them
 * (the order page's sandbox controls). The same advanceBooking is what a
 * house's reply, the insurer's callback and the payment webhook will call
 * once those exist; what changes is who sends the event, not what it does.
 */

import { createAdminClient } from '../supabase/admin';
import { recordEvents } from '../analytics';
import { getOrderById, setOrderStatus, type ItemStatus, type Order } from '../orders';
import { getPassport } from '../passport-store';
import { getOrderProfile } from '../order-profile-store';
import { insuranceRouteFor } from '../insurance/route';
import { EMPTY_PASSPORT } from '../passport';
import { getVendorMinimums, type VendorInsuranceMinimum } from '../insurance/minimums';
import { certificateIssuer, certificateTerms, type Certificate } from '../insurance/issuer';
import { EXTRA_KINDS, paymentProvider, type ExtraKind } from '../payments/provider';
import { VENDORS } from '../vendors';
import type { Source } from '../types';
import {
  BOOKING_EVENTS,
  nextStage,
  orderStatusFor,
  platformFeeCents,
  type Booking,
  type BookingEventInput,
  type BookingEventType,
  type BookingStage,
  type BookingState,
} from './machine';
import { inquiryPacket } from './packet';

/**
 * Start the booking flow for an order that was just placed: save the card (no
 * charge, no hold) and open one booking per house with its inquiry packet.
 * Safe to call twice; the second call returns what the first one opened.
 */
export async function openBookings(order: Order): Promise<Booking[]> {
  if (!order.sandbox) throw new Error('not a sandbox order');
  const existing = await listBookings(order.id, order.orgId);
  if (existing.length > 0) return existing;

  const db = createAdminClient();
  const card = await paymentProvider.saveCard({ orgId: order.orgId, orderId: order.id });
  const { error: cardError } = await db
    .from('orders')
    .update({ payment_method: card })
    .eq('id', order.id)
    .eq('org_id', order.orgId);
  if (cardError) throw cardError;

  const [passport, profile] = await Promise.all([
    getPassport(order.orgId).catch(() => EMPTY_PASSPORT),
    getOrderProfile(order.orgId),
  ]);
  const w9OnFile = Boolean(passport.documents.w9);
  // Decided once, when the inquiry goes out, so the packet and every later
  // step read the same route even if the profile changes mid-booking.
  const insurance = insuranceRouteFor(profile.insurance);
  const at = new Date().toISOString();

  const houses = new Map<string, string>();
  for (const item of order.items) houses.set(item.source, item.vendor);

  const { error } = await db.from('order_bookings').insert(
    [...houses.entries()].map(([vendorId, vendorName]) => ({
      org_id: order.orgId,
      order_id: order.id,
      vendor_id: vendorId,
      vendor_name: vendorName,
      stage: 'inquiry_sent',
      state: {
        packet: inquiryPacket({ vendorName, w9OnFile, insurance }),
        insurance,
        extras: [],
        history: [{ event: 'open', from: null, to: 'inquiry_sent', at }],
      } satisfies BookingState,
    })),
  );
  // A concurrent click opened them first; what it wrote is the answer.
  if (error && error.code !== '23505') throw error;

  return listBookings(order.id, order.orgId);
}

/** An order's bookings, one per house, by house name. Org-scoped. */
export async function listBookings(orderId: string, orgId: string): Promise<Booking[]> {
  const { data, error } = await createAdminClient()
    .from('order_bookings')
    .select('*')
    .eq('order_id', orderId)
    .eq('org_id', orgId)
    .order('vendor_name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as BookingRow[]).map(toBooking);
}

export type AdvanceFailure = 'not_found' | 'not_sandbox' | 'invalid_event' | 'invalid_transition' | 'invalid_input' | 'stale';

export type AdvanceResult =
  | { ok: true; bookings: Booking[] }
  | { ok: false; reason: AdvanceFailure; message: string };

/**
 * Apply one event to one house's booking. Refuses anything the machine does
 * not allow from the booking's current stage, and refuses a second writer that
 * read the same version of the booking (a double-click advances once, and two
 * charges added at once do not overwrite each other).
 *
 * The effect runs before the guarded write. That is safe while every provider
 * is a sandbox that moves nothing; real rails need the write to win first, or
 * an idempotency key per event, so the loser of a race has not moved money.
 */
export async function advanceBooking(
  orderId: string,
  orgId: string,
  vendorId: string,
  input: BookingEventInput,
): Promise<AdvanceResult> {
  if (!isEvent(input.event)) return fail('invalid_event', `Unknown event: ${String(input.event)}.`);

  let order: Order;
  try {
    order = await getOrderById(orderId, orgId);
  } catch {
    return fail('not_found', 'Order not found.');
  }
  // Until real houses, a real insurer and real rails drive these events, a
  // hand-advanced booking on a live order would be a lie about the world.
  if (!order.sandbox) return fail('not_sandbox', 'Only a sandbox order can be advanced by hand.');

  const bookings = await listBookings(orderId, orgId);
  const booking = bookings.find((b) => b.vendorId === vendorId);
  if (!booking) return fail('not_found', 'Booking not found.');

  const to = nextStage(booking.stage, input.event, booking.insurance.route);
  if (!to) return fail('invalid_transition', `${booking.vendorName} is at ${booking.stage}; ${input.event} does not apply.`);

  const effect = await EFFECTS[input.event]({ order, booking, input });
  if ('error' in effect) return fail('invalid_input', effect.error);

  // updated_at is the booking's version: the guarded write below matches on
  // it, so it must move on every event. Two events inside one millisecond
  // would otherwise both pass the guard; the later one is pushed 1ms past the
  // version it read.
  const at = new Date(Math.max(Date.now(), Date.parse(booking.updatedAt) + 1)).toISOString();
  const state: BookingState = {
    ...stateOf(booking),
    ...effect.patch,
    history: [...booking.history, { event: input.event, from: booking.stage, to, at }],
  };

  const { data: written, error } = await createAdminClient()
    .from('order_bookings')
    .update({ stage: to, state, updated_at: at })
    .eq('id', booking.id)
    .eq('stage', booking.stage)
    .eq('updated_at', booking.updatedAt)
    .select('id');
  if (error) throw error;
  if (!written || written.length === 0) return fail('stale', 'This booking already moved. Reload to see where it is.');

  const after = bookings.map((b) => (b.id === booking.id ? { ...b, ...state, stage: to, updatedAt: at } : b));
  // The booking is the record. A projection that fails leaves the order's
  // older status fields behind, which the next event on this order corrects.
  await projectOntoOrder(order, booking, input, after).catch((err) =>
    console.warn(`[booking] order ${orderId} status not updated: ${(err as Error).message}`),
  );

  await recordEvents({
    orgId,
    type: 'booking_advanced',
    payload: { orderId, vendorId, event: input.event, from: booking.stage, to, sandbox: order.sandbox },
  });
  return { ok: true, bookings: after };
}

// ---- internal ----

type EffectContext = { order: Order; booking: Booking; input: BookingEventInput };
type Effect = { patch: Partial<BookingState> } | { error: string };

/** What each event does beyond changing the stage. One entry per event, nowhere else. */
const EFFECTS: Record<BookingEventType, (ctx: EffectContext) => Promise<Effect>> = {
  async confirm({ booking, input }) {
    if (!isPositiveCents(input.amountCents)) return { error: "The house's total must be more than zero." };
    // On the production's own policy, the certificate request goes to their
    // broker the moment the house confirms. In the sandbox it is written and
    // kept on the booking, never sent.
    const coiRequest =
      booking.insurance.route === 'own'
        ? { ...(booking.insurance.brokerEmail ? { to: booking.insurance.brokerEmail } : {}), writtenAt: new Date().toISOString() }
        : undefined;
    return { patch: { amountCents: input.amountCents, ...(coiRequest ? { coiRequest } : {}) } };
  },

  async decline({ input }) {
    const note = input.note?.trim().slice(0, 500);
    return { patch: note ? { declineNote: note } : {} };
  },

  async issue_coi({ order, booking }) {
    const terms = await termsFor(order, booking);
    const certificate = await certificateIssuer.issue({ orderId: order.id, vendorId: booking.vendorId, terms });
    return { patch: { certificate } };
  },

  // The broker's certificate arriving. The real event is an upload or an
  // inbound email; the sandbox stands in a record with the production's own
  // limits on it.
  async receive_coi({ order, booking }) {
    const profile = await getOrderProfile(order.orgId);
    const certificate: Certificate = {
      ...(await termsFor(order, booking, profile.insurance)),
      certificateNumber: `BRK-${order.id.slice(0, 8).toUpperCase()}-${booking.vendorId.toUpperCase()}`,
      issuer: booking.insurance.brokerName ?? 'the production\'s insurer',
      issuedAt: new Date().toISOString(),
    };
    return { patch: { certificate } };
  },

  // The certificate already on file, attached to this house's booking.
  async attach_coi({ order, booking }) {
    const profile = await getOrderProfile(order.orgId);
    const doc = profile.insurance.coiDocument;
    if (!doc) return { error: 'No certificate is on file any more. Upload one on the order profile.' };
    const certificate: Certificate = {
      ...(await termsFor(order, booking, profile.insurance)),
      certificateNumber: doc.name,
      issuer: 'on file',
      issuedAt: doc.uploadedAt,
    };
    return { patch: { certificate } };
  },

  async place_hold({ order, booking }) {
    if (!order.paymentMethod) return { error: 'No card is saved on this order.' };
    if (!isPositiveCents(booking.amountCents)) return { error: 'The house has not confirmed a total.' };
    const hold = await paymentProvider.placeHold({
      card: order.paymentMethod,
      orderId: order.id,
      vendorId: booking.vendorId,
      amountCents: booking.amountCents,
    });
    return { patch: { hold } };
  },

  async expire_hold() {
    return { patch: { hold: undefined } };
  },

  async capture({ booking }) {
    if (!booking.hold) return { error: 'There is no hold to capture.' };
    const capture = await paymentProvider.capture({
      hold: booking.hold,
      vendorId: booking.vendorId,
      feeCents: platformFeeCents(booking.hold.amountCents),
    });
    return { patch: { capture } };
  },

  async charge_extra({ order, booking, input }) {
    if (!order.paymentMethod) return { error: 'No card is saved on this order.' };
    if (!isExtraKind(input.kind)) return { error: 'Pick what the charge is for: damage, loss or a late fee.' };
    if (!isPositiveCents(input.amountCents)) return { error: 'The charge must be more than zero.' };
    const charge = await paymentProvider.chargeExtra({
      card: order.paymentMethod,
      vendorId: booking.vendorId,
      kind: input.kind,
      amountCents: input.amountCents,
      note: input.note?.trim().slice(0, 500) || undefined,
    });
    return { patch: { extras: [...booking.extras, charge] } };
  },
};

/**
 * Keep the order's older status fields true to its bookings: a house's answer
 * lands on that house's lines, and the order's status is read off every house.
 */
async function projectOntoOrder(order: Order, booking: Booking, input: BookingEventInput, after: Booking[]) {
  const answer: { status: ItemStatus; status_note: string | null } | null =
    input.event === 'confirm'
      ? { status: 'confirmed', status_note: null }
      : input.event === 'decline'
        ? { status: 'unavailable', status_note: input.note?.trim() || 'Declined by the house.' }
        : null;
  if (answer) {
    // `order` was loaded scoped to its org, so its id alone scopes the lines.
    const { error } = await createAdminClient()
      .from('order_items')
      .update(answer)
      .eq('order_id', order.id)
      .eq('source', booking.vendorId);
    if (error) throw error;
  }
  const status = orderStatusFor(after.map((b) => b.stage));
  if (status !== order.status) await setOrderStatus(order.id, order.orgId, status);
}

/**
 * The certificate's terms for one house: the house's own minimums where it has
 * them, and on the production's own routes the production's limits, since that
 * is what their certificate will say.
 */
async function termsFor(order: Order, booking: Booking, own?: { glLimit?: number; aggregateLimit?: number }) {
  const minimums: Record<string, VendorInsuranceMinimum> = await getVendorMinimums([booking.vendorId]).catch(() => ({}));
  const vendor = VENDORS[booking.vendorId as Source] ?? { name: booking.vendorName };
  const terms = certificateTerms(vendor, minimums[booking.vendorId], { start: order.rentalStart, end: order.rentalEnd });
  return {
    ...terms,
    ...(own?.glLimit ? { glLimit: own.glLimit } : {}),
    ...(own?.aggregateLimit ? { aggregateLimit: own.aggregateLimit } : {}),
  };
}

function fail(reason: AdvanceFailure, message: string): AdvanceResult {
  return { ok: false, reason, message };
}

function isEvent(v: unknown): v is BookingEventType {
  return typeof v === 'string' && (BOOKING_EVENTS as readonly string[]).includes(v);
}

function isExtraKind(v: unknown): v is ExtraKind {
  return typeof v === 'string' && (EXTRA_KINDS as readonly string[]).includes(v);
}

function isPositiveCents(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 100_000_000;
}

function stateOf(b: Booking): BookingState {
  return {
    packet: b.packet,
    insurance: b.insurance,
    coiRequest: b.coiRequest,
    amountCents: b.amountCents,
    declineNote: b.declineNote,
    certificate: b.certificate,
    hold: b.hold,
    capture: b.capture,
    extras: b.extras,
    history: b.history,
  };
}

type BookingRow = {
  id: string;
  order_id: string;
  vendor_id: string;
  vendor_name: string;
  stage: string;
  state: Partial<BookingState> | null;
  created_at: string;
  updated_at: string;
};

function toBooking(r: BookingRow): Booking {
  const state = r.state ?? {};
  return {
    id: r.id,
    orderId: r.order_id,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    stage: r.stage as BookingStage,
    packet: state.packet ?? [],
    insurance: state.insurance ?? { route: 'athos' },
    ...(state.coiRequest ? { coiRequest: state.coiRequest } : {}),
    ...(state.amountCents !== undefined ? { amountCents: state.amountCents } : {}),
    ...(state.declineNote ? { declineNote: state.declineNote } : {}),
    ...(state.certificate ? { certificate: state.certificate } : {}),
    ...(state.hold ? { hold: state.hold } : {}),
    ...(state.capture ? { capture: state.capture } : {}),
    extras: state.extras ?? [],
    history: state.history ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
