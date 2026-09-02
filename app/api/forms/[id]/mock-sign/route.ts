import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { formsProvider } from '@/lib/forms/filler';
import { getOrderDocument, markDocumentSigned } from '@/lib/forms/documents';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/forms/[id]/mock-sign — the mock provider's stand-in for Anvil's
 * completion webhook. Only answers when FORMS_PROVIDER=mock.
 */
export async function POST(_req: Request, { params }: Params) {
  if (formsProvider() !== 'mock') return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { id } = await params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const doc = await getOrderDocument(id, session.orgId);
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (doc.status !== 'awaiting_signature' && doc.status !== 'signed') {
    return NextResponse.json({ error: 'This document is not waiting for a signature.' }, { status: 409 });
  }

  const document = await markDocumentSigned(doc, { userId: session.userId });
  return NextResponse.json({ document });
}
