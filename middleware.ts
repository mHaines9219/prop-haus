import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session on the routes that read it, and gates the
 * account-only routes.
 *
 * `lib/supabase/server.ts:26` swallows cookie writes from Server Components — those
 * are read-only contexts — and notes that middleware refreshes the session instead.
 * Without this, access tokens expire and Server Components silently start seeing a
 * signed-out user, which is the confusing kind of broken: no error, just an app
 * that logs you out on its own schedule.
 *
 * The matcher below is the flip side: `getUser()` is a blocking round trip to the
 * auth server, and on Vercel middleware runs in FRONT of the CDN cache. Matching
 * every route made each catalog page view and /api/browse call — public surfaces
 * that never read the session — pay that toll before a byte was served. Only the
 * routes that consult the session are matched now; add any new session-reading
 * route to the list or its token will expire mid-session.
 */

// Routes that only make sense with an owner. Everything else (browse, search,
// item pages, cart) stays public.
const PROTECTED_PREFIXES = ['/projects', '/jobs'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Same key resolution as lib/supabase/client.ts and server.ts.
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-out visitors have nothing to see on owned pages — send them to the
  // root, where browse/search still works and the sign-in entry lives.
  if (!user && isProtected(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Owned pages (gated above) and the route handlers that call
    // currentSession(). Everything else — browse, category, item, cart,
    // /api/browse, /api/keyword — is public and skips the auth round trip.
    "/projects/:path*",
    "/api/projects/:path*",
    "/api/clip",
    "/api/usage",
    "/api/search",
    // MVP-8: /jobs is gated above; /orders and /account read the session via
    // requireOrgId, and these API routes call currentSession()/currentOrgId().
    // They were all missing from the matcher, so their tokens expired mid-session.
    "/jobs",
    "/orders/:path*",
    "/account/:path*",
    "/api/checkout",
    "/api/crew/:path*",
    "/api/orders/:path*",
  ],
};
