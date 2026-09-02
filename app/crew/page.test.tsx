// /crew: the public directory reads active crew contractors and honours ?role=.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userDb } from '@/test/mocks/supabase-server';
import { CREW_COPY } from '@/lib/crew';
import CrewPage from './page';

vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

function contractor(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    name: 'Dana Lee',
    photo: null,
    skills: ['set-hands', 'load-in'],
    city: 'Los Angeles',
    rate_low: 35000,
    rate_high: 45000,
    bio: 'Ten years on set.',
    category: 'crew',
    active: true,
    ...over,
  };
}

const shown = (name: string) => screen.queryAllByText(name).length > 0;

function props(role?: string | string[]) {
  return { searchParams: Promise.resolve(role === undefined ? {} : { role }) };
}

beforeEach(() => {
  userDb.reset();
  userDb.seed('contractors', [
    contractor(),
    contractor({ id: 'c-2', name: 'Ravi Patel', skills: ['delivery'] }),
    contractor({ id: 'c-3', name: 'Inactive Ida', active: false }),
    contractor({ id: 'c-4', name: 'Caterer Cal', category: 'catering' }),
  ]);
});

describe('CrewPage', () => {
  it('renders the copy and only active crew contractors', async () => {
    render(await CrewPage(props()));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CREW_COPY.headline);
    expect(screen.getByText(CREW_COPY.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(CREW_COPY.footerNote)).toBeInTheDocument();
    expect(shown('Dana Lee')).toBe(true);
    expect(shown('Ravi Patel')).toBe(true);
    expect(shown('Inactive Ida')).toBe(false);
    expect(shown('Caterer Cal')).toBe(false);
    expect(screen.getByTestId('site-nav')).toBeInTheDocument();
  });

  it('pre-filters by a valid ?role=', async () => {
    render(await CrewPage(props('delivery')));
    expect(shown('Ravi Patel')).toBe(true);
    expect(shown('Dana Lee')).toBe(false);
  });

  it('ignores an unknown or repeated ?role=', async () => {
    render(await CrewPage(props('caterer')));
    expect(shown('Dana Lee')).toBe(true);
    expect(shown('Ravi Patel')).toBe(true);

    render(await CrewPage(props(['delivery', 'production-assistant'])));
    expect(shown('Dana Lee')).toBe(true);
  });

  it('renders with an empty roster', async () => {
    userDb.reset();
    render(await CrewPage(props()));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CREW_COPY.headline);
    expect(shown('Dana Lee')).toBe(false);
  });
});
