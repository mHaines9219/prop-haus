import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { listOrderDocuments } from '@/lib/forms/documents';

/** GET /api/forms?orderId= — the paperwork rows on one of the org's orders. */
export async function GET(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const orderId = new URL(req.url).searchParams.get('orderId');
  if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

  const documents = await listOrderDocuments(orderId, session.orgId);
  return NextResponse.json({ documents });
}
