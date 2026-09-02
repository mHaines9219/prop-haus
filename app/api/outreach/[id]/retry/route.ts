import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { retryOutboundMessage } from '@/lib/outreach/send';

/** POST /api/outreach/[id]/retry — re-send a failed vendor request as stored. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const result = await retryOutboundMessage(id, session.orgId);
  if (!result.ok) {
    return result.reason === 'not_found'
      ? NextResponse.json({ error: 'not found' }, { status: 404 })
      : NextResponse.json({ error: 'only failed messages can be retried' }, { status: 409 });
  }
  return NextResponse.json({ message: result.message });
}
