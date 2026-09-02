import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { orderDefaults, orderReadiness } from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';

/**
 * What the cart shows before the click: whether the profile can place an
 * order, what's missing if not, and the defaults the order will get.
 */
export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const profile = await getOrderProfile(session.orgId);
  return NextResponse.json({
    ...orderReadiness(profile),
    defaults: { ...orderDefaults(profile), rentalWindowDays: profile.defaults.rentalWindowDays },
  });
}
