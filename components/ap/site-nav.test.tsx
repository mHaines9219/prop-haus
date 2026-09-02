import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCart } from '@/lib/cart-store';
import { makeCardItem } from '@/test/fixtures/catalog';
import { SiteNav } from './site-nav';

// Nav chrome: wordmark, section links, the cart badge fed by the store, the
// theme toggle, and the account link that follows Supabase auth state.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants', 'mode']);
  const strip = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => !MOTION.has(k)));
  const cache = new Map<string, React.FC<any>>();
  return {
    motion: new Proxy({}, {
      get: (_t, tag) => {
        const k = String(tag);
        if (!cache.has(k)) cache.set(k, ({ children, ...p }: any) => React.createElement(k, strip(p), children));
        return cache.get(k);
      },
    }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
  };
});

const auth = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: unknown) => void),
  unsubscribe: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.callback = cb;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
    },
  }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme: () => {} }) }));

const signal = (session: unknown) => act(() => auth.callback?.('SIGNED_IN', session));

describe('SiteNav', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] });
    auth.callback = null;
    auth.unsubscribe.mockReset();
  });

  it('renders the wordmark and section links', () => {
    render(<SiteNav />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Prop Haus' })).toHaveAttribute('href', '/');
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveTextContent('How it works');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
    expect(screen.getByRole('link', { name: 'Crew' })).toHaveAttribute('href', '/crew');
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('button', { name: /Switch to/ })).toBeInTheDocument();
  });

  it('shows a bare cart link with no badge when the cart is empty', () => {
    render(<SiteNav />);
    const cart = screen.getByRole('link', { name: 'Cart' });
    expect(cart).toHaveAttribute('href', '/cart');
    expect(cart.querySelector('.bg-accent')).toBeNull();
  });

  it('counts the cart lines in the badge and the accessible name', () => {
    const a = makeCardItem({ sourceId: 'a' });
    const b = makeCardItem({ sourceId: 'b' });
    useCart.getState().add(a);
    useCart.getState().add(b);
    render(<SiteNav />);
    const cart = screen.getByRole('link', { name: 'Cart, 2 items' });
    expect(cart.querySelector('.bg-accent')).toHaveTextContent('2');

    act(() => useCart.getState().remove(a.id));
    expect(screen.getByRole('link', { name: 'Cart, 1 items' })).toHaveTextContent('1');
    act(() => useCart.getState().clear());
    expect(screen.getByRole('link', { name: 'Cart' }).querySelector('.bg-accent')).toBeNull();
  });

  it('holds the account slot empty until auth state arrives', () => {
    render(<SiteNav />);
    expect(screen.queryByRole('link', { name: 'Your account' })).toBeNull();
  });

  it('links to /login when signed out and /account when signed in', () => {
    render(<SiteNav />);
    signal(null);
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/login');
    signal({ user: { id: 'u1' } });
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/account');
  });

  it('unsubscribes from auth changes on unmount', () => {
    const { unmount } = render(<SiteNav />);
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
