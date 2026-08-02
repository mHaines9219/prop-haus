import { NextResponse } from 'next/server';
import { currentOrgId, currentPlan } from '@/lib/session';
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
  const [orgId, plan] = await Promise.all([currentOrgId(), currentPlan()]);
  return NextResponse.json({ plan, metrics: await usageSnapshot(orgId, plan) });
}
