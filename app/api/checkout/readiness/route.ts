import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { orderDefaults, orderReadiness, productionSummary } from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';
import { getPassport } from '@/lib/passport-store';
import { EMPTY_PASSPORT } from '@/lib/passport';
import { listProjectSummaries } from '@/lib/projects';

/**
 * What the cart shows before the click: whether the profile can place an
 * order, what's missing if not (and the production fields it has so far, so
 * the cart can ask for the rest inline), the defaults the order will get,
 * and the projects the order can be placed on (the cart's project picker).
 */
export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const [profile, projects, passport] = await Promise.all([
    getOrderProfile(session.orgId),
    // The picker and the passport are conveniences; a failed read leaves them
    // empty rather than blocking the click.
    listProjectSummaries(session.orgId).catch(() => []),
    getPassport(session.orgId).catch(() => EMPTY_PASSPORT),
  ]);
  return NextResponse.json({
    ...orderReadiness(profile),
    defaults: { ...orderDefaults(profile), rentalWindowDays: profile.defaults.rentalWindowDays },
    production: productionSummary(profile),
    projects,
    passport,
  });
}
