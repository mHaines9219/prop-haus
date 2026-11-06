import { NextResponse } from 'next/server';
import { respondToVendorLink } from '@/lib/vendor-respond';
import { RESPOND_PATH } from '@/lib/vendor-links';

/**
 * POST /api/vendor/respond — the one button on /vendor/respond.
 *
 * Form body: `t`, the signed token. The write lives behind a POST so a mail
 * scanner that fetches every link in an email (and so opens both answers)
 * records nothing. No session: the token is the credential, and the route is
 * outside the auth middleware matcher. Lands back on the page with the
 * outcome in `r`, so a reload of the confirmation writes nothing either.
 */
export async function POST(req: Request) {
  let token = '';
  try {
    const form = await req.formData();
    const t = form.get('t');
    if (typeof t === 'string') token = t;
  } catch {
    token = '';
  }
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });

  let r: 'changed' | 'same' | 'error';
  try {
    const result = await respondToVendorLink(token);
    if (!result.ok) return NextResponse.redirect(new URL(RESPOND_PATH, req.url), 303);
    r = result.changed ? 'changed' : 'same';
  } catch (err) {
    console.error('[vendor/respond] write failed', err);
    r = 'error';
  }
  const back = new URL(RESPOND_PATH, req.url);
  back.searchParams.set('t', token);
  back.searchParams.set('r', r);
  return NextResponse.redirect(back, 303);
}
