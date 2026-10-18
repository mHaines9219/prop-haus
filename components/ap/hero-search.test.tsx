import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { aiAllowance, planView, withPlan } from '@/test/helpers/plan';
import { HeroSearch } from './hero-search';

// The landing search pill: keyword submits route to /search, AI mode opens the
// curation dialog and routes with ai=1, and the engine choice is remembered.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants']);
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

const input = () => screen.getByRole('searchbox', { name: 'Search the catalogue' });

describe('HeroSearch', () => {
  beforeEach(() => {
    resetNavigation();
  });

  it('renders the search form with its three actions', () => {
    render(<HeroSearch />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(input()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attach a PDF or moodboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI Mode' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'submit');
  });

  it('routes a trimmed, encoded keyword query on Enter', async () => {
    render(<HeroSearch />);
    await userEvent.type(input(), '  70s apartment  {Enter}');
    expect(nav.router.push).toHaveBeenCalledWith('/search?q=70s%20apartment');
  });

  it('routes on the Search button too', async () => {
    render(<HeroSearch />);
    await userEvent.type(input(), 'brass lamp');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(nav.router.push).toHaveBeenCalledWith('/search?q=brass%20lamp');
  });

  it('does nothing for an empty or whitespace query', async () => {
    render(<HeroSearch />);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.type(input(), '   {Enter}');
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lights the pill border while the field is focused', async () => {
    const { container } = render(<HeroSearch />);
    const pill = container.querySelector('[data-slot="search-bar"]')!;
    expect(pill).toHaveClass('border-ink');
    await userEvent.click(input());
    expect(pill).toHaveClass('border-accent');
    await userEvent.tab();
    expect(pill).toHaveClass('border-ink');
  });

  it('switches to AI mode, opens the dialog seeded with the query, and remembers the engine', async () => {
    render(<HeroSearch />);
    await userEvent.type(input(), 'moody bar');
    await userEvent.click(screen.getByRole('button', { name: 'AI Mode' }));

    expect(screen.getByRole('button', { name: 'AI Mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('dialog', { name: 'AI set curation' })).toBeInTheDocument();
    expect(screen.getByLabelText('Inspiration')).toHaveValue('moody bar');
    expect(window.localStorage.getItem('prophaus.searchEngine')).toBe('ai');
  });

  it('routes the curated query with ai=1 and the budget when the dialog submits', async () => {
    render(<HeroSearch />);
    await userEvent.type(input(), 'moody bar');
    await userEvent.click(screen.getByRole('button', { name: 'AI Mode' }));
    await waitFor(() => expect(screen.getByLabelText('Inspiration')).toHaveFocus());
    await userEvent.type(screen.getByLabelText(/Budget/), '2500');
    await userEvent.click(screen.getByRole('button', { name: 'Curate my set' }));

    expect(nav.router.push).toHaveBeenCalledWith('/search?q=moody+bar&ai=1&budget=2500');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('omits the budget param when none was entered', async () => {
    render(<HeroSearch />);
    await userEvent.type(input(), 'set');
    await userEvent.click(screen.getByRole('button', { name: 'AI Mode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Curate my set' }));
    expect(nav.router.push).toHaveBeenCalledWith('/search?q=set&ai=1');
  });

  it('reopens the dialog instead of routing when submitting in AI mode', async () => {
    render(<HeroSearch />);
    await userEvent.click(screen.getByRole('button', { name: 'AI Mode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.type(input(), 'velvet sofa{Enter}');
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('wears the rainbow tab class in both engines; the armed state is aria-pressed', async () => {
    render(<HeroSearch />);
    const ai = screen.getByRole('button', { name: 'AI Mode' });
    expect(ai).toHaveClass('ai-mode');
    expect(ai).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(ai);
    expect(ai).toHaveClass('ai-mode');
    expect(ai).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles back to keyword mode on a second AI Mode click', async () => {
    render(<HeroSearch />);
    const ai = screen.getByRole('button', { name: 'AI Mode' });
    await userEvent.click(ai);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(ai);
    expect(ai).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('prophaus.searchEngine')).toBe('keyword');
  });

  it('restores a saved AI engine preference on mount', () => {
    window.localStorage.setItem('prophaus.searchEngine', 'ai');
    render(<HeroSearch />);
    expect(screen.getByRole('button', { name: 'AI Mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores an unknown saved engine value', () => {
    window.localStorage.setItem('prophaus.searchEngine', 'quantum');
    render(<HeroSearch />);
    expect(screen.getByRole('button', { name: 'AI Mode' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('HeroSearch with the AI allowance spent', () => {
  const spent = () => planView('free', { aiSearches: aiAllowance({ used: 3, remaining: 0, allowed: false }) });

  it('greys out AI MODE, disables it, and says when the count comes back', () => {
    render(withPlan(<HeroSearch />, spent()));
    const ai = screen.getByRole('button', { name: 'AI Mode' });
    expect(ai).toBeDisabled();
    expect(ai).toHaveAttribute('aria-pressed', 'false');
    expect(ai).toHaveAttribute('title', 'No AI searches left this week');
    expect(screen.getByText(/AI searches used up this week/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See rates' })).toHaveAttribute('href', '/pricing');
  });

  it('submits a remembered AI engine as a keyword search instead of opening the modal', async () => {
    window.localStorage.setItem('prophaus.searchEngine', 'ai');
    render(withPlan(<HeroSearch />, spent()));
    await userEvent.type(input(), 'brass lamp{Enter}');
    expect(nav.router.push).toHaveBeenCalledWith('/search?q=brass%20lamp');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays live while the allowance has searches left', () => {
    render(withPlan(<HeroSearch />, planView('free', { aiSearches: aiAllowance({ used: 2, remaining: 1 }) })));
    expect(screen.getByRole('button', { name: 'AI Mode' })).toBeEnabled();
    expect(screen.getByText('Attach a PDF or moodboard')).toBeInTheDocument();
  });
});
