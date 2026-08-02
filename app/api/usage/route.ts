import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { usageSnapshot } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The current org's metered standing, for rendering "12 of 20 left".
 *
 * Read-only: asking how much is left never consumes any. Scoped to the session's
 * org rather than an id in the query string, so one org cannot read another's
 * usage.
 */
export async function GET() {
  // 401, not a redirect: this is fetched by client code, which needs a status it
  // can branch on rather than the HTML of a sign-in page.
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { orgId, plan } = session;
  return NextResponse.json({ plan, metrics: await usageSnapshot(orgId, plan) });
}
