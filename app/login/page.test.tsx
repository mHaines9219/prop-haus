import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import LoginPage from './page';

// Sign-in is a magic link or Google. The redirect target rides `?next=` and
// must stay on this site; these tests pin what reaches Supabase.

const { auth } = vi.hoisted(() => ({
  auth: { signInWithOtp: vi.fn(), signInWithOAuth: vi.fn() },
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }));
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => null }));
vi.mock('@/components/ap/site-footer', () => ({ SiteFooter: () => null }));

const origin = window.location.origin;
const callback = (next: string) => `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

beforeEach(() => {
  resetNavigation();
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initial render', () => {
  it('shows both sign-in paths with the email button disabled until typed', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Prop Haus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeDisabled();
    expect(screen.queryByText('That link did not work')).not.toBeInTheDocument();
  });

  it('explains an expired callback link', () => {
    nav.searchParams = new URLSearchParams('error=auth');
    render(<LoginPage />);
    expect(screen.getByText('That link did not work')).toBeInTheDocument();
    expect(screen.getByText(/Request a new one below/)).toBeInTheDocument();
  });

  it('keeps the email button disabled for whitespace', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), '   ');
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeDisabled();
  });
});

describe('magic link', () => {
  it('sends the trimmed email with a callback that carries next', async () => {
    const user = userEvent.setup();
    nav.searchParams = new URLSearchParams('next=/cart');
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), '  sam@nocturne.example  ');
    await user.click(screen.getByRole('button', { name: 'Email me a link' }));

    expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'sam@nocturne.example',
      options: { emailRedirectTo: callback('/cart') },
    });
    expect(await screen.findByText('Check sam@nocturne.example')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email me a link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('falls back to /projects when next is absent', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(callback('/projects'));
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '\\evil.example', 'cart'])(
    'drops the unsafe next %s',
    async (next) => {
      const user = userEvent.setup();
      nav.searchParams = new URLSearchParams({ next });
      render(<LoginPage />);
      await user.type(screen.getByLabelText('Email'), 'a@b.co');
      await user.click(screen.getByRole('button', { name: 'Email me a link' }));
      expect(auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(callback('/projects'));
    },
  );

  it('shows Sending… and disables the button while waiting', async () => {
    const user = userEvent.setup();
    let resolve!: (v: { error: null }) => void;
    auth.signInWithOtp.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    resolve({ error: null });
    expect(await screen.findByText('Check a@b.co')).toBeInTheDocument();
  });

  it('shows the provider error and keeps the form', async () => {
    const user = userEvent.setup();
    auth.signInWithOtp.mockResolvedValue({ error: { message: 'Rate limit exceeded' } });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Email me a link' }));
    expect(await screen.findByText('Rate limit exceeded')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co');
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeEnabled();
  });
});

describe('Google', () => {
  it('starts the OAuth flow with the same callback and stays in the redirecting state', async () => {
    const user = userEvent.setup();
    nav.searchParams = new URLSearchParams('next=/orders/1');
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: callback('/orders/1') },
    });
    expect(await screen.findByRole('button', { name: 'Redirecting…' })).toBeDisabled();
  });

  it('shows the OAuth error and re-enables the button', async () => {
    const user = userEvent.setup();
    auth.signInWithOAuth.mockResolvedValue({ error: { message: 'Provider disabled' } });
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Provider disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});
