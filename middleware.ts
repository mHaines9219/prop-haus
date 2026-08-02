import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase auth session on every request.
 *
 * `lib/supabase/server.ts:26` swallows cookie writes from Server Components — those
 * are read-only contexts — and notes that middleware refreshes the session instead.
 * That middleware did not exist. Without it, access tokens expire and Server
 * Components silently start seeing a signed-out user, which is the confusing kind
 * of broken: no error, just an app that logs you out on its own schedule.
 *
 * This ONLY refreshes. It does not gate access — there is no sign-in page to
 * redirect to yet, so a redirect here would strand every visitor. Route protection
 * lands with the login UI (see PLANS/PROP_HAUS_AUTH_WIRING.md). Until then this is
 * a no-op for signed-out visitors, which is every visitor today.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to BOTH the request (so anything downstream in this same pass sees
          // the refreshed token) and a rebuilt response (so the browser gets the
          // Set-Cookie). Updating only one is the standard way to get a session that
          // appears to refresh and then isn't there on the next request.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser(), not getSession(): getSession() trusts the cookie as-is,
  // while getUser() revalidates the token with the auth server. This call is also
  // what triggers the refresh — removing it makes the whole middleware inert.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files.
     *
     * `/vendor/:token` is deliberately INCLUDED here but must never be gated when
     * route protection lands: vendors are unauthenticated and their 16-byte URL
     * token is the only credential they have. Refreshing a session they don't have
     * is harmless; requiring one would break the vendor response loop, which is the
     * single thing the MVP exists to validate.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
