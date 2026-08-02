import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-redirect';

/**
 * Where a magic link lands. Exchanges the one-time code for a session cookie.
 *
 * MUST stay unauthenticated — this is the route that *creates* the session, so
 * gating it would make signing in impossible. Same category as
 * `/vendor/[token]`, for a different reason.
 *
 * On first sign-in the `handle_new_user()` trigger has already created the
 * organization, owner membership and profile stub by the time this returns, so
 * there is no bootstrap to do here and no null-org window to handle.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Re-checked here rather than trusted: this value made a round trip through an
  // email, so it is untrusted input by the time it comes back. See
  // lib/safe-redirect.ts for what gets rejected and why.
  const next = safeNext(url.searchParams.get('next'));

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin));

  if (!code) return fail('missing_code');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // Expired, already-used, or issued for a different browser. Send them back to
  // request a fresh link rather than showing a raw error page.
  if (error) return fail('exchange_failed');

  return NextResponse.redirect(new URL(next, url.origin));
}
