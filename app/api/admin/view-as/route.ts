import { NextResponse } from 'next/server';
import { parseViewAs, VIEW_AS_COOKIE } from '@/lib/admin';
import { currentSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The admin's masquerade switch. POST `{ plan }` to view the site as that
 * tier; POST `{ plan: null }` to go back to your own. The choice lives in an
 * httpOnly cookie that lib/session.ts applies on every later request, for
 * admins only; nobody else can set it (403) and it would do nothing if they
 * could.
 */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { plan?: unknown } | null;
  if (!body || !('plan' in body)) {
    return NextResponse.json({ error: 'plan required' }, { status: 400 });
  }

  const plan = body.plan === null ? null : parseViewAs(typeof body.plan === 'string' ? body.plan : null);
  if (body.plan !== null && !plan) {
    return NextResponse.json({ error: 'unknown plan' }, { status: 400 });
  }

  const res = NextResponse.json({ viewingAs: plan });
  if (plan) {
    res.cookies.set(VIEW_AS_COOKIE, plan, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    res.cookies.set(VIEW_AS_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  }
  return res;
}
