// /account: session gate, profile + org fields, readiness branch, and the lifetime activity tiles.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID, USER_ID } from '@/test/mocks/session';
import { auth, userDb } from '@/test/mocks/supabase-server';
import { makeOrder, makeOrderItem, READY_PROFILE } from '@/test/fixtures/orders';
import { EMPTY_ORDER_PROFILE } from '@/lib/order-profile';
import { summarizeOrder } from '@/lib/orders';
import type { CrewRequestRow, JobsOverview } from '@/lib/jobs';
import AccountPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/jobs', () => ({ getJobsOverview: vi.fn() }));
vi.mock('@/lib/order-profile-store', () => ({ getOrderProfile: vi.fn() }));

const jobs = vi.mocked(await import('@/lib/jobs'));
const store = vi.mocked(await import('@/lib/order-profile-store'));

function overview(over: Partial<JobsOverview> = {}): JobsOverview {
  return {
    jobs: [],
    crew: [],
    stats: {
      ordersInFlight: 0,
      itemsPending: 0,
      itemsQuoted: 0,
      itemsConfirmed: 0,
      crewPending: 0,
      vendorsNotified: 0,
      messagesSent: 0,
      documentsPending: 0,
    },
    ...over,
  };
}

const CREW: CrewRequestRow = {
  id: 'cr-1',
  contractorId: 'c-1',
  contractorName: 'Dana Lee',
  contractorPhoto: null,
  requestedDates: [],
  location: null,
  notes: null,
  status: 'confirmed',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function seedAccount(profile: Record<string, unknown> = {}, org: Record<string, unknown> = {}) {
  userDb.seed('profiles', [
    {
      id: USER_ID,
      org_id: ORG_ID,
      email: 'sam@nocturne.example',
      full_name: 'Sam Reyes',
      profession: 'set_decorator',
      created_at: '2026-03-15T12:00:00.000Z',
      ...profile,
    },
  ]);
  userDb.seed('organizations', [{ id: ORG_ID, name: 'Nocturne Pictures', plan: 'pro', ...org }]);
}

beforeEach(() => {
  userDb.reset();
  auth.reset();
  auth.user = { id: USER_ID, email: 'sam@nocturne.example' };
  jobs.getJobsOverview.mockReset();
  jobs.getJobsOverview.mockResolvedValue(overview());
  store.getOrderProfile.mockReset();
  store.getOrderProfile.mockResolvedValue(READY_PROFILE);
});

describe('AccountPage', () => {
  it('redirects a signed-out visitor to /login with next=/account', async () => {
    signOut();
    await expect(AccountPage()).rejects.toThrow('/login?next=%2Faccount');
    expect(jobs.getJobsOverview).not.toHaveBeenCalled();
  });

  it('renders the profile and organization for the signed-in org', async () => {
    signIn();
    seedAccount();
    render(await AccountPage());

    expect(jobs.getJobsOverview).toHaveBeenCalledWith(ORG_ID);
    expect(store.getOrderProfile).toHaveBeenCalledWith(ORG_ID);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sam Reyes');
    expect(screen.getByText('sam@nocturne.example')).toBeInTheDocument();
    expect(screen.getByText('Set decorator')).toBeInTheDocument();
    expect(screen.getByText(/Mar \d+, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Nocturne Pictures')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Order profile →' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('link', { name: 'View jobs in progress →' })).toHaveAttribute('href', '/jobs');
  });

  it('shows the ready token when the order profile is complete', async () => {
    signIn();
    seedAccount();
    render(await AccountPage());
    expect(screen.getByText('Ready to order')).toBeInTheDocument();
    expect(screen.queryByText(/missing before one-click/)).not.toBeInTheDocument();
  });

  it('counts what is missing and links to the profile when it is not', async () => {
    signIn();
    seedAccount();
    store.getOrderProfile.mockResolvedValue(EMPTY_ORDER_PROFILE);
    render(await AccountPage());
    const link = screen.getByRole('link', { name: /missing before one-click/ });
    expect(link).toHaveAttribute('href', '/account/profile');
    expect(link).toHaveTextContent('5 things missing before one-click →');
  });

  it('uses the singular when exactly one thing is missing', async () => {
    signIn();
    seedAccount();
    store.getOrderProfile.mockResolvedValue({
      ...READY_PROFILE,
      authorization: { formsOnBehalf: false },
    });
    render(await AccountPage());
    expect(screen.getByRole('link', { name: /missing before one-click/ })).toHaveTextContent(
      '1 thing missing before one-click →',
    );
  });

  it('derives the lifetime activity tiles from the jobs overview', async () => {
    signIn();
    seedAccount();
    const order = makeOrder({
      items: [
        makeOrderItem({ id: 'a', status: 'confirmed' }),
        makeOrderItem({ id: 'b', status: 'confirmed', vendor: 'Newel' }),
        makeOrderItem({ id: 'c', status: 'pending' }),
      ],
    });
    const other = makeOrder({ id: 'order-2', items: [makeOrderItem({ id: 'd', status: 'confirmed' })] });
    jobs.getJobsOverview.mockResolvedValue(
      overview({
        jobs: [
          { ...order, vendorSummaries: summarizeOrder(order), messagesSent: 0 },
          { ...other, vendorSummaries: summarizeOrder(other), messagesSent: 0 },
        ],
        crew: [CREW, { ...CREW, id: 'cr-2' }],
        stats: { ...overview().stats, vendorsNotified: 2 },
      }),
    );
    render(await AccountPage());

    const tile = (label: string) => screen.getByText(label).previousElementSibling;
    expect(tile('Orders placed')).toHaveTextContent('2');
    expect(tile('Items rented')).toHaveTextContent('3');
    expect(tile('Crew hired')).toHaveTextContent('2');
    expect(tile('Vendors notified')).toHaveTextContent('2');
  });

  it('falls back to the raw profession and the auth email when the profile is thin', async () => {
    signIn();
    seedAccount({ full_name: null, profession: 'gaffer', created_at: null });
    render(await AccountPage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('sam@nocturne.example');
    expect(screen.getByText('gaffer')).toBeInTheDocument();
    expect(screen.getByText('Member since').nextElementSibling).toHaveTextContent('—');
    expect(screen.getAllByText('Name', { selector: 'dt' })).toHaveLength(2);
  });

  it('renders placeholders when neither profile nor org rows exist', async () => {
    signIn();
    render(await AccountPage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your account');
    expect(screen.getByText('Email').nextElementSibling).toHaveTextContent('sam@nocturne.example');
    expect(screen.getByText('Plan').nextElementSibling).toHaveTextContent('—');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('shows an unknown plan value verbatim', async () => {
    signIn();
    seedAccount({}, { plan: 'enterprise' });
    render(await AccountPage());
    expect(screen.getByText('Plan').nextElementSibling).toHaveTextContent('enterprise');
  });
});
