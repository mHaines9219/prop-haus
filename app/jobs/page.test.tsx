// /jobs: session gate, empty state, stat band, the orders table (rollup copy,
// thumbs, status tabs, search, sorting, row navigation) and the crew table.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
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

/** The table row that carries a link with this accessible name. */
function rowOf(name: RegExp): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr')!;
}

beforeEach(() => {
  jobs.getJobsOverview.mockReset();
  resetNavigation();
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
    expect(screen.getByRole('link', { name: /Order #ABCDEF12/ })).toHaveAttribute(
      'href',
      '/orders/abcdef12-9999',
    );
    const row = rowOf(/Order #ABCDEF12/);
    expect(row).toHaveTextContent('PLACED');
    expect(row).toHaveTextContent('Omega Cinema Props confirmed 1 of 3 items. 2 pending.');
    expect(within(row).getByRole('cell', { name: /^3 1 confirmed$/ })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: /^1 not sent$/ })).toBeInTheDocument();
    expect(row).toHaveTextContent(/Sep \d+, 2026/);
    expect(within(row).getAllByRole('img')).toHaveLength(2);
    expect(screen.queryByText('Crew')).not.toBeInTheDocument();
  });

  it('navigates to the order when the row itself is clicked, but not from a link or with a modifier', async () => {
    signIn();
    jobs.getJobsOverview.mockResolvedValue(overview({ jobs: [job(makeOrder({ id: 'order-9' }))] }));
    render(await JobsPage());
    const row = rowOf(/Order #ORDER-9/);

    await userEvent.click(within(row).getByText('PLACED'));
    expect(nav.router.push).toHaveBeenCalledWith('/orders/order-9');

    nav.router.push.mockClear();
    await userEvent.click(within(row).getByRole('link', { name: /Order #ORDER-9/ }));
    expect(nav.router.push).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.keyboard('{Meta>}');
    await user.click(within(row).getByText('PLACED'));
    await user.keyboard('{/Meta}');
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('filters orders by the status tabs and the search box, and offers to clear a filter with no matches', async () => {
    signIn();
    jobs.getJobsOverview.mockResolvedValue(
      overview({
        jobs: [
          job(makeOrder({ id: 'aaaa-1', status: 'placed' })),
          job(
            makeOrder({
              id: 'bbbb-2',
              status: 'confirmed',
              items: [makeOrderItem({ id: 'x', vendor: 'Newel', status: 'confirmed' })],
            }),
          ),
          job(makeOrder({ id: 'cccc-3', status: 'processing' })),
        ],
      }),
    );
    render(await JobsPage());

    const tabs = screen.getByRole('tablist', { name: 'Filter orders by status' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'All3',
      'Placed1',
      'Processing1',
      'Confirmed1',
    ]);
    expect(screen.getAllByRole('link', { name: /Order #/ })).toHaveLength(3);

    await userEvent.click(within(tabs).getByRole('tab', { name: /Confirmed/ }));
    expect(screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent)).toEqual([
      'Order #BBBB-2',
    ]);

    await userEvent.click(within(tabs).getByRole('tab', { name: /^All/ }));
    expect(screen.getAllByRole('link', { name: /Order #/ })).toHaveLength(3);

    const search = screen.getByRole('searchbox', { name: 'Search orders' });
    await userEvent.type(search, 'newel');
    expect(screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent)).toEqual([
      'Order #BBBB-2',
    ]);

    await userEvent.clear(search);
    await userEvent.type(search, 'zzzz');
    expect(screen.queryByRole('link', { name: /Order #/ })).not.toBeInTheDocument();
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('No orders match that filter.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('link', { name: /Order #/ })).toHaveLength(3);
    expect(search).toHaveValue('');
  });

  it('sorts by the most recent update first and flips when a header is clicked', async () => {
    signIn();
    jobs.getJobsOverview.mockResolvedValue(
      overview({
        jobs: [
          job(makeOrder({ id: 'old-1', status: 'confirmed', updatedAt: '2026-08-01T00:00:00.000Z' })),
          job(makeOrder({ id: 'new-2', status: 'placed', updatedAt: '2026-09-02T00:00:00.000Z' })),
          job(makeOrder({ id: 'mid-3', status: 'processing', updatedAt: '2026-08-20T00:00:00.000Z' })),
        ],
      }),
    );
    render(await JobsPage());
    const codes = () => screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent);

    expect(codes()).toEqual(['Order #NEW-2', 'Order #MID-3', 'Order #OLD-1']);
    const updated = screen.getByRole('button', { name: 'Updated' });
    expect(updated.closest('th')).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(updated);
    expect(codes()).toEqual(['Order #OLD-1', 'Order #MID-3', 'Order #NEW-2']);
    expect(updated.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(codes()).toEqual(['Order #NEW-2', 'Order #MID-3', 'Order #OLD-1']);
    expect(updated.closest('th')).not.toHaveAttribute('aria-sort');
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
    const row = rowOf(/Order #ORDER-1/);
    expect(row).toHaveTextContent('2 vendors, 1 of 2 items confirmed. 1 unavailable.');
    expect(within(row).getByRole('cell', { name: /^2 1 confirmed$/ })).toBeInTheDocument();
    expect(within(row).getByRole('cell', { name: /^2 not sent$/ })).toBeInTheDocument();
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

    const dana = screen.getByText('Dana Lee', { selector: 'p' }).closest('tr')!;
    expect(dana).toHaveTextContent('REQUESTED');
    expect(dana).toHaveTextContent(/Sep \d+, 2026, Sep \d+, 2026/);
    expect(dana).toHaveTextContent('Burbank');

    const ravi = screen.getByText('Ravi Patel', { selector: 'p' }).closest('tr')!;
    expect(ravi).toHaveTextContent('DECLINED');
    expect(ravi).toHaveTextContent('Dates on request');

    // Newest request first, then by name when the header is clicked.
    const names = () => screen.getAllByRole('row').slice(-2).map((r) => r.textContent?.match(/Dana Lee|Ravi Patel/)?.[0]);
    expect(names()).toEqual(['Dana Lee', 'Ravi Patel']);
    await userEvent.click(screen.getByRole('button', { name: 'Contractor' }));
    expect(names()).toEqual(['Dana Lee', 'Ravi Patel']);
    await userEvent.click(screen.getByRole('button', { name: 'Contractor' }));
    expect(names()).toEqual(['Ravi Patel', 'Dana Lee']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search crew' }), 'ravi');
    expect(screen.queryByText('Dana Lee', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.getByText('Ravi Patel', { selector: 'p' })).toBeInTheDocument();
  });
});
