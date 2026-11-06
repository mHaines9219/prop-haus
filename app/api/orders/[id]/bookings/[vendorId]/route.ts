import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { advanceBooking, type AdvanceFailure } from '@/lib/booking/store';
import type { BookingEventInput } from '@/lib/booking/machine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/[id]/bookings/[vendorId]: apply one event to one house's
 * booking. This is the sandbox's manual advance: the order page posts
 * `{ event }` (plus `amountCents`, `note`, `kind` where the event reads them)
 * and gets every booking on the order back.
 *
 * Admins only, org-scoped from the session, and refused for any order that
 * was not placed in the sandbox.
 */

const STATUS: Record<AdvanceFailure, number> = {
  not_found: 404,
  not_sandbox: 409,
  invalid_transition: 409,
  stale: 409,
  invalid_event: 400,
  invalid_input: 400,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string; vendorId: string }> }) {
  const { id, vendorId } = await params;

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Partial<BookingEventInput> | null;
  if (!body || typeof body.event !== 'string') {
    return NextResponse.json({ error: 'event is required' }, { status: 400 });
  }

  const result = await advanceBooking(id, session.orgId, vendorId, {
    event: body.event,
    amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
    kind: body.kind,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, reason: result.reason }, { status: STATUS[result.reason] });
  }
  return NextResponse.json({ bookings: result.bookings });
}
