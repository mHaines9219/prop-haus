/**
 * POST /api/spacelab/scenes — prepare (or rebuild) the 3D room for an order.
 *
 * Body: { orderId: string }
 * Returns: PreparedScene — room URL, room file URL, catalog URL, model counts.
 *
 * Auth required, and the order is looked up under the caller's org, so an
 * order id from another production resolves to a 404 rather than a room.
 */

import { NextResponse } from 'next/server';
import { currentOrgId } from '@/lib/session';
import { prepareSceneForOrder } from '@/lib/spacelab/handoff';

export async function POST(req: Request) {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const orderId = (body as { orderId?: unknown } | null)?.orderId;
  if (typeof orderId !== 'string' || !orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  try {
    const scene = await prepareSceneForOrder(orderId, orgId);
    return NextResponse.json(scene);
  } catch (err) {
    // getOrderById throws for an order that is missing OR belongs to someone
    // else; both are "no such order" from here, and the generation path is
    // already non-throwing per item.
    const message = err instanceof Error ? err.message : 'could not prepare the room';
    console.error('[spacelab] prepare failed', err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
