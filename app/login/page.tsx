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
 * Magic link rather than a password.
 *
 * No password to store, no reset flow, no second screen — and this audience is
 * set decorators and production designers working on a stage, not people who
 * will reach for a password manager. Supabase's `handle_new_user()` trigger
 * creates the organization, membership and profile on first sign-in, so there
 * is no separate sign-up path to build or to choose between.
 */
function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
