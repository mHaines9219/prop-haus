// /jobs: session gate, empty state, stat band, job rows (rollup copy, thumbs) and crew rows.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { makeOrder, makeOrderItem } from '@/test/fixtures/orders';
import { summarizeOrder, type Order } from '@/lib/orders';
import type { CrewRequestRow, Job, JobsOverview } from '@/lib/jobs';
import JobsPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/jobs', async () => ({
  ...(await vi.importActual<typeof import('@/lib/jobs')>('@/lib/jobs')),
  getJobsOverview: vi.fn(),
}));

const jobs = vi.mocked(await import('@/lib/jobs'));

function job(order: Order): Job {
  return { ...order, vendorSummaries: summarizeOrder(order), messagesSent: 0 };
}

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

function crew(over: Partial<CrewRequestRow> = {}): CrewRequestRow {
  return {
    id: 'cr-1',
    contractorId: 'c-1',
    contractorName: 'Dana Lee',
    contractorPhoto: 'https://img.example/dana.jpg',
    requestedDates: ['2026-09-10T12:00:00.000Z', '2026-09-11T12:00:00.000Z'],
    location: 'Burbank',
    notes: null,
    status: 'requested',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  jobs.getJobsOverview.mockReset();
});

describe('JobsPage', () => {
  it('redirects a signed-out visitor to /login with next=/jobs', async () => {
    signOut();
    await expect(JobsPage()).rejects.toThrow('/login?next=%2Fjobs');
    expect(jobs.getJobsOverview).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing is in flight', async () => {
    signIn();
    jobs.getJobsOverview.mockResolvedValue(overview());
    render(await JobsPage());
    expect(jobs.getJobsOverview).toHaveBeenCalledWith(ORG_ID);
    expect(screen.getByText('Nothing in flight')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/search');
    expect(screen.queryByText('In flight')).not.toBeInTheDocument();
    expect(screen.queryByText('Orders in flight')).not.toBeInTheDocument();
  });

  it('renders the stat band from the overview stats', async () => {
    signIn();
    jobs.getJobsOverview.mockResolvedValue(
      overview({
        jobs: [job(makeOrder())],
        stats: {
          ordersInFlight: 1,
          itemsPending: 2,
          itemsQuoted: 3,
          itemsConfirmed: 4,
          crewPending: 5,
          vendorsNotified: 6,
          messagesSent: 0,
          documentsPending: 0,
        },
      }),
    );
    render(await JobsPage());
    const tile = (label: string) => screen.getByText(label).previousElementSibling;
    expect(tile('Orders in flight')).toHaveTextContent('1');
    expect(tile('Items pending')).toHaveTextContent('2');
    expect(tile('Items quoted')).toHaveTextContent('3');
    expect(tile('Items confirmed')).toHaveTextContent('4');
    expect(tile('Crew pending')).toHaveTextContent('5');
    expect(tile('Vendors notified')).toHaveTextContent('6');
  });

  it('renders a job row with its link, status, rollup copy, thumbs and item count', async () => {
    signIn();
    const order = makeOrder({
      id: 'abcdef12-9999',
      status: 'placed',
      items: [
        makeOrderItem({ id: 'a', status: 'confirmed', name: 'Credenza' }),
        makeOrderItem({ id: 'b', status: 'pending', name: 'Lamp' }),
        makeOrderItem({ id: 'c', status: 'quoted', name: 'Rug', image: undefined }),
      ],
    });
    jobs.getJobsOverview.mockResolvedValue(overview({ jobs: [job(order)] }));
    render(await JobsPage());

    expect(screen.getByText('In flight')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: /Order #ABCDEF12/ });
    expect(row).toHaveAttribute('href', '/orders/abcdef12-9999');
    expect(row).toHaveTextContent('PLACED');
    expect(row).toHaveTextContent('Omega Cinema Props confirmed 1 of 3 items. 2 pending.');
    expect(row).toHaveTextContent('3 items');
    expect(row).toHaveTextContent(/Sep \d+, 2026/);
    expect(within(row).getAllByRole('img')).toHaveLength(2);
    expect(screen.queryByText('Crew')).not.toBeInTheDocument();
  });

  it('uses the multi-vendor rollup and a blank plate when no item has a photo', async () => {
    signIn();
    const order = makeOrder({
      items: [
        makeOrderItem({ id: 'a', vendor: 'Newel', status: 'confirmed', image: undefined }),
        makeOrderItem({ id: 'b', vendor: 'Omega Cinema Props', status: 'unavailable', image: undefined }),
      ],
    });
    jobs.getJobsOverview.mockResolvedValue(overview({ jobs: [job(order)] }));
    render(await JobsPage());
    const row = screen.getByRole('link', { name: /Order #ORDER-1/ });
    expect(row).toHaveTextContent('2 vendors, 1 of 2 items confirmed. 1 unavailable.');
    expect(row).toHaveTextContent('2 items');
    expect(within(row).queryAllByRole('img')).toHaveLength(0);
  });

  it('renders crew rows with dates, location and status', async () => {
    signIn();
    jobs.getJobsOverview.mockResolvedValue(
      overview({
        crew: [
          crew(),
          crew({
            id: 'cr-2',
            contractorName: 'Ravi Patel',
            contractorPhoto: null,
            requestedDates: [],
            location: null,
            status: 'declined',
          }),
        ],
      }),
    );
    render(await JobsPage());

    expect(screen.getByText('Crew')).toBeInTheDocument();
    expect(screen.queryByText('In flight')).not.toBeInTheDocument();

    const dana = screen.getByText('Dana Lee', { selector: 'p' }).closest('div')!.parentElement!;
    expect(dana).toHaveTextContent('REQUESTED');
    expect(dana).toHaveTextContent(/Sep \d+, 2026, Sep \d+, 2026 · Burbank/);

    const ravi = screen.getByText('Ravi Patel', { selector: 'p' }).closest('div')!.parentElement!;
    expect(ravi).toHaveTextContent('DECLINED');
    expect(ravi).toHaveTextContent('Dates on request');
    expect(ravi).not.toHaveTextContent('·');
  });
});
