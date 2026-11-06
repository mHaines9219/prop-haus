import { NextResponse, after } from 'next/server';
import { currentSession } from '@/lib/session';
import { createOrder, parseCartLines } from '@/lib/orders';
import { getProject } from '@/lib/projects';
import {
  applyProductionPatch,
  normalizeAddress,
  normalizeProductionPatch,
  orderDefaults,
  orderReadiness,
  orderRequestReadiness,
} from '@/lib/order-profile';
import { getOrderProfileForUpdate, updateOrderProfile } from '@/lib/order-profile-store';
import { recordEvents } from '@/lib/analytics';
import { queueSpacelabHandoff } from '@/lib/spacelab/handoff';
import { formsEnabled, formsProvider } from '@/lib/forms/filler';
import { buildOrderPaperwork } from '@/lib/forms/packet';
import { listOrderMessages, normalizeOverrides, sendOrderOutreach } from '@/lib/outreach/send';
import { openBookings } from '@/lib/booking/store';

type CheckoutBody = {
  lines?: unknown;
  rentalStart?: unknown;
  rentalEnd?: unknown;
  deliveryAddress?: unknown;
  deliveryNotes?: unknown;
  /** From the cart's request form: what is being shot and how the pieces are used. */
  shootDetails?: unknown;
  /**
   * The production fields the cart asked for because the profile lacked them
   * (legal name, ordering contact, authorization). Saved to the profile first,
   * so the next cart does not ask again.
   */
  production?: unknown;
  /** Vendor emails the user edited on the cart: { vendorId, subject?, bodyText? }[]. */
  messages?: unknown;
  /** The project the order is for (its Jobs section lists it). Optional. */
  projectId?: unknown;
  /**
   * The mode the cart was showing when it was clicked. The server decides the
   * mode from the session; this only lets it refuse a click whose page said
   * one thing while the session says another.
   */
  sandbox?: unknown;
  idempotencyKey?: unknown;
};

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as CheckoutBody | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }
  if (idempotencyKey.length > IDEMPOTENCY_KEY_MAX) {
    return NextResponse.json({ error: 'idempotencyKey is too long' }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'cart is empty' }, { status: 400 });
  }
  const lines = parseCartLines(body.lines);
  if (!lines) {
    return NextResponse.json({ error: 'a cart line is invalid' }, { status: 400 });
  }
  // A cart left open while the sandbox switch was flipped elsewhere still
  // shows the old mode. Placing a live order from a page that promised
  // "mail to the test inbox" is the one way a sandbox test could email a vendor, so a
  // mismatch in either direction is refused before anything is written.
  if (typeof body.sandbox === 'boolean' && body.sandbox !== session.sandbox) {
    return NextResponse.json({ error: MODE_CHANGED, reason: 'mode_changed' }, { status: 409 });
  }

  // One-click-safe even without the UI: the profile fills whatever the body
  // leaves out, and an incomplete profile refuses rather than placing a half
  // order. The cart's production fields land on the profile before that
  // check, so filling them in the cart is the same as filling the profile.
  // The strict read: the production patch below writes the profile back, and
  // an outage read as "empty" would erase it.
  let profile = await getOrderProfileForUpdate(session.orgId);
  const production = normalizeProductionPatch(body.production);
  if (production) {
    profile = applyProductionPatch(profile, production, { userId: session.userId });
    await updateOrderProfile(session.orgId, profile);
  }
  const readiness = orderReadiness(profile);
  if (!readiness.ready) {
    return NextResponse.json(
      { error: 'order profile is incomplete', missing: readiness.missing },
      { status: 422 },
    );
  }
  const defaults = orderDefaults(profile);

  // A project id is only ever the session org's own: an unknown or foreign id
  // is refused rather than silently dropped, so the cart never thinks an
  // order landed on a project it did not.
  let projectId: string | undefined;
  if (body.projectId !== undefined && body.projectId !== null && body.projectId !== '') {
    if (typeof body.projectId !== 'string') {
      return NextResponse.json({ error: 'projectId must be a string' }, { status: 400 });
    }
    const project = await getProject(session.orgId, body.projectId);
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
    projectId = project.id;
  }

  // The request itself: what the cart form asked for, with the profile's
  // rental window filling in dates the body left out. Every vendor needs the
  // dates, so a request without them is refused the same way an incomplete
  // profile is — the cart checks this first, this is the backstop. Pickup is
  // assumed: the profile's delivery defaults are never applied here, and an
  // address is stored only when the caller sent one.
  const request = {
    rentalStart: str(body.rentalStart) || defaults.rentalStart,
    rentalEnd: str(body.rentalEnd) || defaults.rentalEnd,
    deliveryAddress: normalizeAddress(body.deliveryAddress),
    deliveryNotes: str(body.deliveryNotes),
    shootDetails: str(body.shootDetails, SHOOT_DETAILS_MAX),
  };
  const requestReadiness = orderRequestReadiness(request);
  if (!requestReadiness.ready) {
    return NextResponse.json(
      { error: 'request is incomplete', missing: requestReadiness.missing },
      { status: 422 },
    );
  }

  const order = await createOrder({
    orgId: session.orgId,
    projectId,
    lines,
    ...request,
    sandbox: session.sandbox,
    idempotencyKey,
  });
  // A replayed key returns the order as it was first placed. If that was in
  // the other mode, running this mode's steps on it would be wrong either way.
  if (order.sandbox !== session.sandbox) {
    return NextResponse.json({ error: MODE_CHANGED, reason: 'mode_changed' }, { status: 409 });
  }

  // ── POST-CHECKOUT HOOKS ──────────────────────────────────────────────────
  // Non-fatal extension points for follow-on tasks.

  const vendorCount = new Set(order.items.map((i) => i.vendor)).size;
  await recordEvents({
    orgId: session.orgId,
    userId: session.userId,
    type: 'order_placed',
    payload: { orderId: order.id, itemCount: order.items.length, vendorCount, sandbox: order.sandbox },
  });

  // FUT-2: warm the Spacelab set preview — generate a 3D model per ordered item
  // and write the room file, so "Build your set in 3D" is a click rather than a
  // wait. `after()` rather than a bare floating promise: this runs on serverless,
  // where work started but not awaited can be killed the moment the response is
  // sent. It is non-fatal by construction (queueSpacelabHandoff swallows its own
  // errors) and skippable with SPACELAB_PREWARM=off.
  after(() => queueSpacelabHandoff(order, session.orgId));

  // ── BOOKING FLOW (sandbox) ───────────────────────────────────────────────
  // An admin with the sandbox switch on places a sandbox order: the card is
  // saved with no charge, one booking opens per house, and each inquiry is
  // written but never handed to a mailer. All of it finishes before the
  // response so the order page the cart lands on is already complete; the
  // bookings then advance by hand from that page.
  if (order.sandbox) {
    // Each step finds its own earlier work, so a replayed or interrupted click
    // finishes what is missing and writes nothing twice.
    await openBookings(order);
    const written = await listOrderMessages(order.id, session.orgId).catch(() => []);
    if (written.length === 0) {
      // Only the mock filler: a sandbox order never calls a real forms provider.
      if (formsEnabled() && formsProvider() === 'mock') {
        await buildOrderPaperwork(order.id, session.orgId, session.plan);
      }
      await sendOrderOutreach(order, { overrides: normalizeOverrides(body.messages) });
    }
    return NextResponse.json({ id: order.id }, { status: 201 });
  }
  // ── end BOOKING FLOW ─────────────────────────────────────────────────────

  // ── MVP-12 PAPERWORK ─────────────────────────────────────────────────────
  // Every vendor form we have a template for, filled from the order profile
  // and stored on the order so the outreach below can attach it. Runs before
  // outreach by registration order. buildOrderPaperwork never throws;
  // FORMS=off skips it.
  after(async () => {
    if (formsEnabled()) await buildOrderPaperwork(order.id, session.orgId, session.plan);
  });
  // ── end MVP-12 ───────────────────────────────────────────────────────────

  // ── MVP-11 OUTREACH ──────────────────────────────────────────────────────
  // The pre-written vendor requests go out with this same click. MVP-12's
  // paperwork block belongs ABOVE this one so its filled forms exist to
  // attach. Non-fatal (sendOrderOutreach swallows its own errors); OUTREACH=off
  // skips it.
  const overrides = normalizeOverrides(body.messages);
  after(() => sendOrderOutreach(order, { overrides }));
  // ── end MVP-11 ───────────────────────────────────────────────────────────

  return NextResponse.json({ id: order.id }, { status: 201 });
}

const SHOOT_DETAILS_MAX = 4000;

const IDEMPOTENCY_KEY_MAX = 200;

const MODE_CHANGED = 'Sandbox mode changed since this cart loaded. Reload the cart and place the order again.';

/** A trimmed string from untrusted JSON, or undefined when blank or not a string. */
function str(v: unknown, max = 500): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}
