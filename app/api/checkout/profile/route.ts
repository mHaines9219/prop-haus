import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { getCheckoutProfile, updateCheckoutProfile, type CheckoutProfile } from '@/lib/orders';

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const profile = await getCheckoutProfile(session.orgId);
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as Partial<CheckoutProfile>;
  const existing = await getCheckoutProfile(session.orgId);

  await updateCheckoutProfile(session.orgId, { ...existing, ...body });
  return NextResponse.json({ ok: true });
}
