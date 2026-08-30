'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { createClient } from '@/lib/supabase/client';
import { safeNext } from '@/lib/safe-redirect';

/**
 * Google sign-in or a magic link — no password either way.
 *
 * No password to store, no reset flow, no second screen — and this audience is
 * set decorators and production designers working on a stage, not people who
 * will reach for a password manager. Supabase's `handle_new_user()` trigger
 * creates the organization, membership and profile on first sign-in (Google
 * included — it reads full_name/name from the provider metadata), so there is
 * no separate sign-up path to build or to choose between.
 */
function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  // Where to land after the link is followed. Constrained to this site so a
  // crafted ?next= cannot turn our sign-in into somebody else's landing page.
  const next = safeNext(params.get('next'));

  // Surfaced by app/auth/callback when the exchange fails — an expired or
  // already-used link lands here rather than on a dead end.
  const callbackError = params.get('error');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Must be an absolute URL, and must be listed in the project's redirect
        // allow-list or Supabase silently drops it.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setPending(false);
    if (signInError) setError(signInError.message);
    else setSent(true);
  }

  async function signInWithGoogle() {
    setGooglePending(true);
    setError(null);

    const supabase = createClient();
    // PKCE flow: Google hands back a one-time code, and the same /auth/callback
    // route that handles magic links exchanges it for a session cookie.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    // On success the browser navigates away to Google, so only the failure path
    // ever runs past this point.
    if (oauthError) {
      setGooglePending(false);
      setError(oauthError.message);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-12">
      <div className="space-y-2">
        <Heading level={1}>Sign in</Heading>
        <Text color="secondary">
          We will email you a link. No password to remember.
        </Text>
      </div>

      {callbackError && (
        <Banner
          status="error"
          title="That link did not work"
          description="Sign-in links expire and can only be used once. Request a new one below."
        />
      )}

      {sent ? (
        <Banner
          status="success"
          title={`Check ${email}`}
          description="Follow the link in that email to finish signing in. You can close this tab."
        />
      ) : (
        <div className="space-y-4">
          <Button
            label={googlePending ? 'Redirecting…' : 'Continue with Google'}
            variant="secondary"
            isDisabled={googlePending}
            onClick={signInWithGoogle}
          />
          <Text type="supporting" color="secondary">
            or get a link by email
          </Text>
          <form onSubmit={submit} className="space-y-4">
          <TextInput
            label="Email"
            type="email"
            isRequired
            value={email}
            onChange={setEmail}
            placeholder="you@production.com"
            status={error ? { type: 'error', message: error } : undefined}
          />
          <Button
            type="submit"
            label={pending ? 'Sending…' : 'Email me a link'}
            variant="primary"
            isDisabled={pending || !email.trim()}
          />
          </form>
        </div>
      )}

      <Text type="supporting" color="secondary">
        Vendors responding to a request do not need an account — use the link from
        your request email.
      </Text>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side rendering.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
