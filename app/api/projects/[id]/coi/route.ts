import { NextResponse } from 'next/server';
import { setCoiStatus, type CoiStatus } from '@/lib/projects';
import type { Source } from '@/lib/types';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { vendor: Source; status: CoiStatus; certUrl?: string };
  const p = await setCoiStatus(id, body.vendor, body.status, body.certUrl);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
