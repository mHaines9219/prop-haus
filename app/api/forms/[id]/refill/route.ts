import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { refillDocument } from '@/lib/forms/packet';

type Params = { params: Promise<{ id: string }> };

/** POST /api/forms/[id]/refill — re-run one document after a profile fix. */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  try {
    const document = await refillDocument(id, session.orgId, session.plan);
    if (!document) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ document });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'refill failed';
    if (message.includes('already signed')) {
      return NextResponse.json({ error: 'This document is already signed.' }, { status: 409 });
    }
    console.error('[forms/refill]', err);
    return NextResponse.json({ error: 'refill failed' }, { status: 500 });
  }
}
