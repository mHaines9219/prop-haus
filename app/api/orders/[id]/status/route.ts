import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import {
  setItemStatus,
  setJobStatus,
  setOrderStatus,
  type ItemStatus,
  type OrderStatus,
} from '@/lib/orders';
import { isJobStatus, type JobStatus } from '@/lib/job-status';
import { recordEvents } from '@/lib/analytics';
import type { LogEventInput } from '@/lib/events';

/**
 * PATCH /api/orders/[id]/status — move an order and/or its line items forward,
 * or set the user's own board status.
 *
 * Body: {
 *   status?: OrderStatus,
 *   jobStatus?: JobStatus,           // active | pending | done, set by the user from the project's Jobs section
 *   items?: [{ id, status: ItemStatus, note?, quotedCents? }]
 * }
 *
 * `status`/`items` are the seam a future vendor portal or ops tool writes
 * through; for now they power `pnpm simulate:vendor`. `jobStatus` is the one
 * field the user writes by hand. Session-checked and org-scoped — the org is
 * resolved from the session, never the body, and the lib layer verifies each
 * item's parent order belongs to that org before writing.
 */

const ORDER_STATUSES: OrderStatus[] = ['placed', 'processing', 'confirmed', 'cancelled'];
const ITEM_STATUSES: ItemStatus[] = ['pending', 'quoted', 'confirmed', 'unavailable'];

const NOTE_MAX = 1000;

type Body = { status?: unknown; jobStatus?: unknown; items?: unknown };

type ItemUpdate = { id: string; status: ItemStatus; note: string | null; quotedCents: number | null };

/** One `items[]` entry, or null when any field is unusable. */
function parseItem(raw: unknown): ItemUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, status, note, quotedCents } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !id) return null;
  if (!ITEM_STATUSES.includes(status as ItemStatus)) return null;
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > NOTE_MAX)) return null;
  if (
    quotedCents !== undefined &&
    quotedCents !== null &&
    !(typeof quotedCents === 'number' && Number.isInteger(quotedCents) && quotedCents >= 0)
  ) {
    return null;
  }
  return { id, status: status as ItemStatus, note: note ?? null, quotedCents: quotedCents ?? null };
}

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
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const hasItems = Array.isArray(body.items) ? body.items.length > 0 : Boolean(body.items);
  if (!body.status && !body.jobStatus && !hasItems) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  // Everything is validated before anything is written, so a bad entry late
  // in the list cannot leave the earlier ones half-applied.
  const items: ItemUpdate[] = [];
  if (body.items !== undefined && body.items !== null) {
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }
    for (const raw of body.items) {
      const item = parseItem(raw);
      if (!item) {
        const status = raw && typeof raw === 'object' ? (raw as { status?: unknown }).status : undefined;
        return NextResponse.json({ error: `invalid item status: ${String(status)}` }, { status: 400 });
      }
      items.push(item);
    }
  }
  let status: OrderStatus | undefined;
  if (body.status) {
    if (!ORDER_STATUSES.includes(body.status as OrderStatus)) {
      return NextResponse.json({ error: `invalid order status: ${String(body.status)}` }, { status: 400 });
    }
    status = body.status as OrderStatus;
  }
  let jobStatus: JobStatus | undefined;
  if (body.jobStatus) {
    if (!isJobStatus(body.jobStatus)) {
      return NextResponse.json({ error: `invalid job status: ${String(body.jobStatus)}` }, { status: 400 });
    }
    jobStatus = body.jobStatus;
  }

  const events: LogEventInput[] = [];

  try {
    for (const item of items) {
      // Scoped to this order, not just the org: an item id from another of
      // the org's orders reads as not found here.
      await setItemStatus(item.id, session.orgId, item.status, {
        note: item.note,
        quotedCents: item.quotedCents,
        orderId: id,
      });
      events.push({
        orgId: session.orgId,
        userId: session.userId,
        type: 'item_status_changed',
        payload: { orderId: id, orderItemId: item.id, status: item.status },
      });
    }

    if (status) {
      await setOrderStatus(id, session.orgId, status);
      events.push({
        orgId: session.orgId,
        userId: session.userId,
        type: 'order_status_changed',
        payload: { orderId: id, status },
      });
    }

    if (jobStatus) {
      await setJobStatus(id, session.orgId, jobStatus);
      events.push({
        orgId: session.orgId,
        userId: session.userId,
        type: 'job_status_changed',
        payload: { orderId: id, jobStatus },
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
