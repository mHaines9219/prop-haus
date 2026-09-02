// /orders/[id]: session gate, not-found, and every conditional branch of the job detail view.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { makeOrder, makeOrderItem } from '@/test/fixtures/orders';
import { summarizeOrder, type Order } from '@/lib/orders';
import type { PreparedScene } from '@/lib/spacelab/handoff';
import OrderPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/jobs', async () => ({
  ...(await vi.importActual<typeof import('@/lib/jobs')>('@/lib/jobs')),
  getJobDetail: vi.fn(),
}));
vi.mock('@/lib/spacelab/handoff', () => ({ getSceneForOrder: vi.fn() }));
vi.mock('@/lib/outreach/send', () => ({ listOrderMessages: vi.fn(async () => []) }));
vi.mock('@/lib/forms/documents', () => ({ listOrderDocuments: vi.fn(async () => []) }));
vi.mock('@/lib/order-profile-store', async () => ({
  getOrderProfile: vi.fn(async () => (await import('@/lib/order-profile')).EMPTY_ORDER_PROFILE),
}));

const jobs = vi.mocked(await import('@/lib/jobs'));
const handoff = vi.mocked(await import('@/lib/spacelab/handoff'));

function detailFor(order: Order) {
  return { order, vendorSummaries: summarizeOrder(order) };
}

function props(id = 'order-1') {
  return { params: Promise.resolve({ id }) };
}

const SCENE: PreparedScene = {
  id: 'scene-1',
  itemCount: 2,
  modelReadyCount: 1,
  roomUrl: 'https://spacelab.example/rooms/scene-1',
  roomFileUrl: '/api/spacelab/scenes/scene-1/room.json',
  catalogUrl: '/api/spacelab/scenes/scene-1/catalog.json',
  updatedAt: '2026-09-02T10:00:00.000Z',
};

beforeEach(() => {
  jobs.getJobDetail.mockReset();
  handoff.getSceneForOrder.mockReset();
  handoff.getSceneForOrder.mockResolvedValue(null);
});

describe('OrderPage', () => {
  it('redirects a signed-out visitor to /login carrying the order path', async () => {
    signOut();
    await expect(OrderPage(props('order-9'))).rejects.toThrow('/login?next=%2Forders%2Forder-9');
    expect(jobs.getJobDetail).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the signed-in org and 404s when it misses', async () => {
    signIn();
    jobs.getJobDetail.mockResolvedValue(null);
    await expect(OrderPage(props('someone-elses'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(jobs.getJobDetail).toHaveBeenCalledWith('someone-elses', ORG_ID);
  });

  it('renders the header, rental window, delivery address and per-vendor rollups', async () => {
    signIn();
    const order = makeOrder({
      id: 'abcdef12-3456',
      status: 'processing',
      deliveryNotes: 'Loading dock B, ask for Sam',
      items: [
        makeOrderItem({ id: 'o1', vendor: 'Omega Cinema Props', status: 'confirmed', name: 'Credenza' }),
        makeOrderItem({ id: 'o2', vendor: 'Omega Cinema Props', status: 'pending', name: 'Lamp' }),
        makeOrderItem({ id: 'o3', vendor: 'Omega Cinema Props', status: 'unavailable', name: 'Rug' }),
        makeOrderItem({ id: 'n1', vendor: 'Newel', status: 'confirmed', name: 'Sofa' }),
      ],
    });
    jobs.getJobDetail.mockResolvedValue(detailFor(order));
    render(await OrderPage(props(order.id)));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('#ABCDEF12');
    expect(screen.getByText('PROCESSING')).toBeInTheDocument();
    expect(screen.getByText('4 items from 2 vendors')).toBeInTheDocument();
    expect(screen.getByText(/September \d+, 2026/)).toBeInTheDocument();

    expect(screen.getByText('Rental window')).toBeInTheDocument();
    expect(screen.getByText('2026-09-07')).toBeInTheDocument();
    expect(screen.getByText('2026-09-14')).toBeInTheDocument();
    expect(screen.getByText('4100 W Alameda Ave, Burbank, CA 91505')).toBeInTheDocument();
    expect(screen.getByText('Loading dock B, ask for Sam')).toBeInTheDocument();

    expect(screen.getByText('1 of 3 confirmed · 1 pending · 1 unavailable')).toBeInTheDocument();
    expect(screen.getByText('1 of 1 confirmed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Omega Cinema Props' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Newel' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'All jobs' })).toHaveAttribute('href', '/jobs');
    expect(screen.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/search');
  });

  it('renders each item with its vendor link, status token, note and quote', async () => {
    signIn();
    const order = makeOrder({
      items: [
        makeOrderItem({
          id: 'q1',
          name: 'Quoted lamp',
          status: 'quoted',
          quotedCents: 45050,
          statusNote: 'Available from the 8th',
          sourceUrl: 'https://omegacinemaprops.com/item/q1',
        }),
        makeOrderItem({ id: 'q2', name: 'Quoted without figure', status: 'quoted' }),
        makeOrderItem({ id: 'p1', name: 'Plain pending', status: 'pending' }),
      ],
    });
    jobs.getJobDetail.mockResolvedValue(detailFor(order));
    render(await OrderPage(props()));

    const link = screen.getByRole('link', { name: 'Quoted lamp' });
    expect(link).toHaveAttribute('href', 'https://omegacinemaprops.com/item/q1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Available from the 8th')).toBeInTheDocument();
    expect(screen.getByText('$451')).toBeInTheDocument();
    expect(screen.getAllByText('QUOTED')).toHaveLength(2);
    expect(screen.getAllByText('$', { exact: false }).filter((n) => n.textContent?.startsWith('$'))).toHaveLength(1);
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 confirmed · 3 pending')).toBeInTheDocument();
  });

  it('omits the rental window block when the order has no dates or address', async () => {
    signIn();
    const order = makeOrder({
      rentalStart: undefined,
      rentalEnd: undefined,
      deliveryAddress: undefined,
      items: [makeOrderItem()],
    });
    jobs.getJobDetail.mockResolvedValue(detailFor(order));
    render(await OrderPage(props()));
    expect(screen.queryByText('Rental window')).not.toBeInTheDocument();
    expect(screen.getByText('1 item from 1 vendor')).toBeInTheDocument();
  });

  it('shows only the start date when the end and address are missing', async () => {
    signIn();
    const order = makeOrder({ rentalEnd: undefined, deliveryAddress: undefined });
    jobs.getJobDetail.mockResolvedValue(detailFor(order));
    render(await OrderPage(props()));
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.queryByText('End')).not.toBeInTheDocument();
    expect(screen.queryByText('Deliver to')).not.toBeInTheDocument();
  });

  it('shows the Spacelab panel in its build state when no room is prepared', async () => {
    signIn();
    jobs.getJobDetail.mockResolvedValue(detailFor(makeOrder()));
    render(await OrderPage(props()));
    expect(handoff.getSceneForOrder).toHaveBeenCalledWith('order-1', ORG_ID);
    expect(screen.getByRole('button', { name: 'Build your set in 3D' })).toBeInTheDocument();
    expect(screen.queryByText('Open in Spacelab')).not.toBeInTheDocument();
  });

  it('passes a prepared scene into the Spacelab panel', async () => {
    signIn();
    jobs.getJobDetail.mockResolvedValue(detailFor(makeOrder()));
    handoff.getSceneForOrder.mockResolvedValue(SCENE);
    render(await OrderPage(props()));
    const panel = screen.getByRole('heading', { name: 'Set preview' }).closest('div')!.parentElement!;
    expect(within(panel).getByRole('link', { name: 'Open in Spacelab' })).toHaveAttribute('href', SCENE.roomUrl!);
    expect(within(panel).getByRole('link', { name: 'Room file' })).toHaveAttribute('href', SCENE.roomFileUrl);
    expect(within(panel).getByText(/1 item still without a model/)).toBeInTheDocument();
  });

  it('still renders when the scene lookup throws', async () => {
    signIn();
    jobs.getJobDetail.mockResolvedValue(detailFor(makeOrder()));
    handoff.getSceneForOrder.mockRejectedValue(new Error('spacelab down'));
    render(await OrderPage(props()));
    expect(screen.getByRole('button', { name: 'Build your set in 3D' })).toBeInTheDocument();
  });
});
