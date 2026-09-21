// /crew: the public directory reads active crew contractors and honours ?role=
// and, for a signed-in org, ?project= (the request form's project picker).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userDb } from '@/test/mocks/supabase-server';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { CREW_COPY } from '@/lib/crew';
import CrewPage from './page';

vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());
vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/projects', async () => ({
  ...(await vi.importActual<typeof import('@/lib/projects')>('@/lib/projects')),
  listProjectSummaries: vi.fn(),
}));
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

const projects = vi.mocked(await import('@/lib/projects'));

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

function props(role?: string | string[], project?: string | string[]) {
  return {
    searchParams: Promise.resolve({
      ...(role === undefined ? {} : { role }),
      ...(project === undefined ? {} : { project }),
    }),
  };
}

beforeEach(() => {
  signOut();
  projects.listProjectSummaries.mockReset();
  projects.listProjectSummaries.mockResolvedValue([
    { id: 'p-1', name: 'Nocturne' },
    { id: 'p-2', name: 'Daylight' },
  ]);
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
    expect(screen.getByRole('button', { name: CREW_COPY.joinCta })).toBeInTheDocument();
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

  it('reads no projects for an anonymous visitor and shows no picker', async () => {
    render(await CrewPage(props()));
    expect(projects.listProjectSummaries).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: CREW_COPY.ctaLabel })[0]);
    expect(screen.queryByLabelText('Project')).toBeNull();
  });

  it('offers the signed-in org’s projects in the request form', async () => {
    signIn();
    render(await CrewPage(props()));
    expect(projects.listProjectSummaries).toHaveBeenCalledWith(ORG_ID);
    expect(screen.getByText(CREW_COPY.eyebrow)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: CREW_COPY.ctaLabel })[0]);
    expect(screen.getByLabelText('Project')).toHaveValue('p-1');
  });

  it('starts on the project in ?project= and links back to it', async () => {
    signIn();
    render(await CrewPage(props(undefined, 'p-2')));
    expect(screen.getByText('Hiring for Daylight')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Daylight' })).toHaveAttribute('href', '/projects/p-2');
    await userEvent.click(screen.getAllByRole('button', { name: CREW_COPY.ctaLabel })[0]);
    expect(screen.getByLabelText('Project')).toHaveValue('p-2');
  });

  it('ignores a ?project= that is not one of the org’s own', async () => {
    signIn();
    render(await CrewPage(props(undefined, 'p-theirs')));
    expect(screen.queryByText(/Hiring for/)).toBeNull();
    expect(screen.getByText(CREW_COPY.eyebrow)).toBeInTheDocument();
  });

  it('still renders when the projects read fails', async () => {
    signIn();
    projects.listProjectSummaries.mockRejectedValue(new Error('boom'));
    render(await CrewPage(props(undefined, 'p-1')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CREW_COPY.headline);
    expect(screen.queryByText(/Hiring for/)).toBeNull();
  });

  it('renders with an empty roster', async () => {
    userDb.reset();
    render(await CrewPage(props()));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CREW_COPY.headline);
    expect(shown('Dana Lee')).toBe(false);
  });
});
