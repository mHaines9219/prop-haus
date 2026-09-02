import { NextResponse, after } from 'next/server';
import { currentSession } from '@/lib/session';
import { createOrder, type CartLineInput } from '@/lib/orders';
import { normalizeAddress, orderDefaults, orderReadiness } from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';
import { paymentProvider } from '@/lib/payments/provider';
import { recordEvents } from '@/lib/analytics';
import { queueSpacelabHandoff } from '@/lib/spacelab/handoff';
import { formsEnabled } from '@/lib/forms/filler';
import { buildOrderPaperwork } from '@/lib/forms/packet';
import { normalizeOverrides, sendOrderOutreach } from '@/lib/outreach/send';

type CheckoutBody = {
  lines: CartLineInput[];
  rentalStart?: string;
  rentalEnd?: string;
  deliveryAddress?: unknown;
  deliveryNotes?: string;
  /** Vendor emails the user edited on the cart: { vendorId, subject?, bodyText? }[]. */
  messages?: unknown;
  idempotencyKey: string;
};

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as CheckoutBody;

  if (!body.idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'cart is empty' }, { status: 400 });
  }

  // One-click-safe even without the UI: the profile fills whatever the body
  // leaves out, and an incomplete profile refuses rather than placing a half
  // order.
  const profile = await getOrderProfile(session.orgId);
  const readiness = orderReadiness(profile);
  if (!readiness.ready) {
    return NextResponse.json(
      { error: 'order profile is incomplete', missing: readiness.missing },
      { status: 422 },
    );
  }
  const defaults = orderDefaults(profile);

  const order = await createOrder({
    orgId: session.orgId,
    lines: body.lines,
    rentalStart: body.rentalStart || defaults.rentalStart,
    rentalEnd: body.rentalEnd || defaults.rentalEnd,
    deliveryAddress: normalizeAddress(body.deliveryAddress) ?? defaults.deliveryAddress,
    deliveryNotes: body.deliveryNotes?.trim() || defaults.deliveryNotes,
    idempotencyKey: body.idempotencyKey,
  });

  // ── POST-CHECKOUT HOOKS ──────────────────────────────────────────────────
  // Non-fatal extension points for follow-on tasks.

  const vendorCount = new Set(order.items.map((i) => i.vendor)).size;
  await recordEvents({
    orgId: session.orgId,
    userId: session.userId,
    type: 'order_placed',
    payload: { orderId: order.id, itemCount: order.items.length, vendorCount },
  });

  // FUT-2: warm the Spacelab set preview — generate a 3D model per ordered item
  // and write the room file, so "Build your set in 3D" is a click rather than a
  // wait. `after()` rather than a bare floating promise: this runs on serverless,
  // where work started but not awaited can be killed the moment the response is
  // sent. It is non-fatal by construction (queueSpacelabHandoff swallows its own
  // errors) and skippable with SPACELAB_PREWARM=off.
  after(() => queueSpacelabHandoff(order, session.orgId));

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

  // Payment abstraction — NullProvider in MVP; swap for real rails later.
  if (order.totalCents) {
    await paymentProvider.authorize({
      orderId: order.id,
      amountCents: order.totalCents,
      currency: 'usd',
    });
  }

  return NextResponse.json({ id: order.id }, { status: 201 });
}
