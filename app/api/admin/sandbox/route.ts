import { NextResponse } from 'next/server';
import { SANDBOX_COOKIE } from '@/lib/admin';
import { currentSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The admin's sandbox switch. POST `{ on: true }` and every order this admin
 * places is a sandbox order (nothing sent, advanced by hand); POST
 * `{ on: false }` to go back. The choice lives in an httpOnly cookie that
 * lib/session.ts honours for admins only.
 */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (!body || typeof body.on !== 'boolean') {
    return NextResponse.json({ error: 'on must be true or false' }, { status: 400 });
  }

  const res = NextResponse.json({ sandbox: body.on });
  if (body.on) {
    res.cookies.set(SANDBOX_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    res.cookies.set(SANDBOX_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  }
  return res;
}
