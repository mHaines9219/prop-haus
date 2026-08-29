import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session on every request, and gates the
 * account-only routes.
 *
 * `lib/supabase/server.ts:26` swallows cookie writes from Server Components — those
 * are read-only contexts — and notes that middleware refreshes the session instead.
 * Without this, access tokens expire and Server Components silently start seeing a
 * signed-out user, which is the confusing kind of broken: no error, just an app
 * that logs you out on its own schedule.
 */

// Routes that only make sense with an owner. Everything else (browse, search,
// item pages, cart) stays public.
const PROTECTED_PREFIXES = ['/projects'];

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
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
