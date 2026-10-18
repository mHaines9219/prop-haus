import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the client needs to know about the caller; see lib/plan-view.tsx. */
export type MeResponse = {
  signedIn: boolean;
  plan: 'free' | 'directory' | 'pro';
  actualPlan: 'free' | 'directory' | 'pro';
  isAdmin: boolean;
};

/**
 * Who is asking, as the client sees it: the effective plan (masquerade
 * applied), the real one, and whether the view-as control should show.
 *
 * Always 200. A signed-out visitor is a free-tier visitor, and the client
 * gates on `plan`, so there is nothing for it to branch on in a 401. No org
 * ids or emails leave here; the nav and the cards need none of that.
 */
export async function GET() {
  const session = await currentSession();
  const body: MeResponse = session
    ? { signedIn: true, plan: session.plan, actualPlan: session.actualPlan, isAdmin: session.isAdmin }
    : { signedIn: false, plan: 'free', actualPlan: 'free', isAdmin: false };
  return NextResponse.json(body, { headers: { 'cache-control': 'private, no-store' } });
}
