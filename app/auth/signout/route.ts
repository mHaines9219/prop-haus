import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST, not GET, deliberately.
 *
 * A GET sign-out can be triggered by any image tag or link prefetch pointing at
 * it, which logs people out at random and is a textbook CSRF footgun. Sign-out
 * changes state, so it takes a method that a cross-site request cannot issue
 * casually.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', new URL(request.url).origin), {
    // 303 so the browser follows with GET rather than replaying the POST.
    status: 303,
  });
}
