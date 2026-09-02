import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { getOrderById } from '@/lib/orders';
import { buildOrderPaperwork } from '@/lib/forms/packet';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/orders/[id]/paperwork — build the paperwork packet by hand, for an
 * order that predates checkout doing it. Idempotent: forms already on the
 * order are left alone.
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  try {
    await getOrderById(id, session.orgId);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const documents = await buildOrderPaperwork(id, session.orgId, session.plan);
  return NextResponse.json({ documents });
}
