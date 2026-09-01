import { NextResponse, after } from 'next/server';
import { currentSession } from '@/lib/session';
import { createOrder, type CartLineInput } from '@/lib/orders';
import { paymentProvider } from '@/lib/payments/provider';
import { recordEvents } from '@/lib/analytics';
import { queueSpacelabHandoff } from '@/lib/spacelab/handoff';

type CheckoutBody = {
  lines: CartLineInput[];
  rentalStart?: string;
  rentalEnd?: string;
  deliveryNotes?: string;
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

  const order = await createOrder({
    orgId: session.orgId,
    lines: body.lines,
    rentalStart: body.rentalStart,
    rentalEnd: body.rentalEnd,
    deliveryNotes: body.deliveryNotes,
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

  // MVP-4: COI issuance per vendor — wire when MVP-4 lands
  // await issueCoisForOrder(order);

  // FUT-2: warm the Spacelab set preview — generate a 3D model per ordered item
  // and write the room file, so "Build your set in 3D" is a click rather than a
  // wait. `after()` rather than a bare floating promise: this runs on serverless,
  // where work started but not awaited can be killed the moment the response is
  // sent. It is non-fatal by construction (queueSpacelabHandoff swallows its own
  // errors) and skippable with SPACELAB_PREWARM=off.
  after(() => queueSpacelabHandoff(order, session.orgId));

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
