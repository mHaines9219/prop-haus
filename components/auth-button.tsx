'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { createClient } from '@/lib/supabase/client';

/**
 * The top-nav auth control: an entry point to /login, or a sign-out form.
 *
 * Client component on purpose. The root layout wraps statically generated
 * pages (category pages), and a server-side session read here would either
 * bake "Sign in" into their prerendered HTML or force every route dynamic.
 * Reading auth state in the browser is correct on both static and dynamic
 * pages — and this is display only; the middleware and RLS enforce the truth.
 *
 * Sign-out is a FORM, not a link — app/auth/signout/route.ts only answers
 * POST, deliberately (see the CSRF note there).
 */
export function AuthButton() {
  // null = not yet known; render nothing rather than flash the wrong button.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Fires INITIAL_SESSION immediately from the stored session, then tracks
    // sign-ins and sign-outs in other tabs.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  if (signedIn === null) return null;

  if (!signedIn) {
    return <Button label="Sign in" variant="ghost" href="/login" />;
  }

  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" label="Sign out" variant="ghost" />
    </form>
  );
}
