import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { normalizeOrderProfile, orderReadiness } from '@/lib/order-profile';
import { getOrderProfile, updateOrderProfile } from '@/lib/order-profile-store';

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const profile = await getOrderProfile(session.orgId);
  return NextResponse.json({ profile, readiness: orderReadiness(profile) });
}

/**
 * Replace the org's order profile with the body. Two fields are server-owned:
 * the COI pointer only changes through the upload route, and the authorization
 * timestamp + user are stamped here the moment consent is first given.
 */
export async function PATCH(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'a profile is required' }, { status: 400 });
  }

  const existing = await getOrderProfile(session.orgId);
  const next = normalizeOrderProfile(body);

  next.insurance = { ...next.insurance };
  if (existing.insurance.coiDocument) next.insurance.coiDocument = existing.insurance.coiDocument;
  else delete next.insurance.coiDocument;

  next.authorization = next.authorization.formsOnBehalf
    ? existing.authorization.formsOnBehalf
      ? existing.authorization
      : { formsOnBehalf: true, acceptedAt: new Date().toISOString(), acceptedByUserId: session.userId }
    : { formsOnBehalf: false };

  await updateOrderProfile(session.orgId, next);
  return NextResponse.json({ ok: true, profile: next, readiness: orderReadiness(next) });
}
