'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeNext } from '@/lib/safe-redirect';
import { PageShell } from '@/components/ap/page-shell';

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  const next = safeNext(params.get('next'));
  const callbackError = params.get('error');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
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
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setGooglePending(false);
      setError(oauthError.message);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-[400px]">
        <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
          Sign in
        </p>
        <h1 className="mt-3 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
          Prop Haus
        </h1>
        <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">
          We&rsquo;ll email you a link. No password to remember.
        </p>

        {callbackError && (
          <div className="mt-6 border-y border-l-2 border-border border-l-accent bg-surface-inset/40 px-5 py-4">
            <p className="text-[15px] font-medium text-foreground">That link did not work</p>
            <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
              Sign-in links expire and can only be used once. Request a new one below.
            </p>
          </div>
        )}

        {sent ? (
          <div className="mt-6 border border-border bg-surface-inset p-5">
            <p className="text-[15px] font-medium text-foreground">Check {email}</p>
            <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
              Follow the link in that email to finish signing in. You can close this tab.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <button
              type="button"
              disabled={googlePending}
              onClick={signInWithGoogle}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-primary text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
            >
              {googlePending ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
                or
              </span>
              <div className="flex-1 border-t border-border" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@production.com"
                  className="h-11 w-full rounded-sm border border-border bg-surface-inset px-4 font-mono text-[15px] text-foreground outline-none placeholder:text-text-tertiary focus:border-border-strong"
                />
                {error && (
                  <p className="mt-2 font-mono text-[11px] leading-[14px] text-accent">{error}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={pending || !email.trim()}
                className="flex h-11 w-full items-center justify-center rounded-sm border border-border text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-popover hover:text-foreground active:scale-[0.98] disabled:opacity-60"
              >
                {pending ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          </div>
        )}

        <p className="mt-8 text-[13px] leading-[19px] text-text-tertiary">
          Vendors responding to a request do not need an account — use the link from your request
          email.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PageShell mainClassName="flex">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </PageShell>
  );
}
