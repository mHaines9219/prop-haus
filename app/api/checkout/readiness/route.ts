import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { orderDefaults, orderReadiness } from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';
import { listProjectSummaries } from '@/lib/projects';

/**
 * What the cart shows before the click: whether the profile can place an
 * order, what's missing if not, the defaults the order will get, and the
 * projects the order can be placed on (the cart's project picker).
 */
export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const [profile, projects] = await Promise.all([
    getOrderProfile(session.orgId),
    // The picker is a convenience; a failed read leaves it empty rather than blocking the click.
    listProjectSummaries(session.orgId).catch(() => []),
  ]);
  return NextResponse.json({
    ...orderReadiness(profile),
    defaults: { ...orderDefaults(profile), rentalWindowDays: profile.defaults.rentalWindowDays },
    projects,
  });
}
