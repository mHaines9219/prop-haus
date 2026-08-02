import { NextResponse } from 'next/server';
import { updateLineStatus, type LineStatus } from '@/lib/projects';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json()) as {
    itemId: string;
    status: LineStatus;
    priceQuote?: number;
    subNote?: string;
  };
  const result = await updateLineStatus(token, body.itemId, body.status, {
    priceQuote: body.priceQuote,
    subNote: body.subNote,
  });
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
