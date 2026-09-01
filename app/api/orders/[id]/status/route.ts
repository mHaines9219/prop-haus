import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import {
  setItemStatus,
  setOrderStatus,
  type ItemStatus,
  type OrderStatus,
} from '@/lib/orders';
import { recordEvents } from '@/lib/analytics';
import type { LogEventInput } from '@/lib/events';

/**
 * PATCH /api/orders/[id]/status — move an order and/or its line items forward.
 *
 * Body: { status?: OrderStatus, items?: [{ id, status: ItemStatus, note?, quotedCents? }] }
 *
 * This is the seam a future vendor portal or ops tool writes through; for now it
 * powers `pnpm simulate:vendor`. Session-checked and org-scoped — the org is
 * resolved from the session, never the body, and the lib layer verifies each
 * item's parent order belongs to that org before writing.
 */

const ORDER_STATUSES: OrderStatus[] = ['placed', 'processing', 'confirmed', 'cancelled'];
const ITEM_STATUSES: ItemStatus[] = ['pending', 'quoted', 'confirmed', 'unavailable'];

type Body = {
  status?: string;
  items?: Array<{ id: string; status: string; note?: string; quotedCents?: number }>;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.status && (!body.items || body.items.length === 0)) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const events: LogEventInput[] = [];

  try {
    if (body.items) {
      for (const item of body.items) {
        if (!item.id || !ITEM_STATUSES.includes(item.status as ItemStatus)) {
          return NextResponse.json({ error: `invalid item status: ${item.status}` }, { status: 400 });
        }
        await setItemStatus(item.id, session.orgId, item.status as ItemStatus, {
          note: item.note ?? null,
          quotedCents: item.quotedCents ?? null,
        });
        events.push({
          orgId: session.orgId,
          userId: session.userId,
          type: 'item_status_changed',
          payload: { orderId: id, orderItemId: item.id, status: item.status },
        });
      }
    }

    if (body.status) {
      if (!ORDER_STATUSES.includes(body.status as OrderStatus)) {
        return NextResponse.json({ error: `invalid order status: ${body.status}` }, { status: 400 });
      }
      await setOrderStatus(id, session.orgId, body.status as OrderStatus);
      events.push({
        orgId: session.orgId,
        userId: session.userId,
        type: 'order_status_changed',
        payload: { orderId: id, status: body.status },
      });
    }
  } catch (err) {
    // The lib layer throws "not found" for anything not owned by this org —
    // treat as a 404 rather than leaking whether the id exists.
    const message = err instanceof Error ? err.message : 'update failed';
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    console.error('[orders/status] update error', err);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  await recordEvents(...events);

  return NextResponse.json({ ok: true });
}
