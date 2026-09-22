import { NextResponse } from 'next/server';
import { currentOrgId } from '@/lib/session';
import { passportSummary } from '@/lib/passport';
import { getPassport } from '@/lib/passport-store';

export async function GET() {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const passport = await getPassport(orgId);
  return NextResponse.json({ passport, summary: passportSummary(passport) });
}
