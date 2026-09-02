// /orders as a plain async function: session gate, empty state, and one row per order.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { makeOrder, makeOrderItem } from '@/test/fixtures/orders';
import OrdersPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/orders', async () => ({
  ...(await vi.importActual<typeof import('@/lib/orders')>('@/lib/orders')),
  listOrders: vi.fn(),
}));

const orders = vi.mocked(await import('@/lib/orders'));

beforeEach(() => {
  orders.listOrders.mockReset();
});

describe('OrdersPage', () => {
  it('redirects a signed-out visitor to /login with next=/orders', async () => {
    signOut();
    await expect(OrdersPage()).rejects.toThrow('/login?next=%2Forders');
    expect(orders.listOrders).not.toHaveBeenCalled();
  });

  it('lists the signed-in org only', async () => {
    signIn();
    orders.listOrders.mockResolvedValue([]);
    render(await OrdersPage());
    expect(orders.listOrders).toHaveBeenCalledWith(ORG_ID);
  });

  it('shows the empty state with a catalog link', async () => {
    signIn();
    orders.listOrders.mockResolvedValue([]);
    render(await OrdersPage());
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/');
    expect(screen.getByTestId('site-nav')).toBeInTheDocument();
  });

  it('renders one row per order with counts, status and a detail link', async () => {
    signIn();
    orders.listOrders.mockResolvedValue([
      makeOrder({
        id: 'abcdef12-3456',
        status: 'confirmed',
        items: [
          makeOrderItem({ id: 'a', vendor: 'Omega Cinema Props' }),
          makeOrderItem({ id: 'b', vendor: 'Omega Cinema Props' }),
          makeOrderItem({ id: 'c', vendor: 'Newel' }),
        ],
      }),
      makeOrder({ id: 'single-1', status: 'cancelled', items: [makeOrderItem()] }),
    ]);
    render(await OrdersPage());

    const first = screen.getByRole('link', { name: /Order #ABCDEF12/ });
    expect(first).toHaveAttribute('href', '/orders/abcdef12-3456');
    expect(first).toHaveTextContent(/Sep \d+, 2026 · 3 items · 2 vendors/);
    expect(first).toHaveTextContent('CONFIRMED');

    const second = screen.getByRole('link', { name: /Order #SINGLE-1/ });
    expect(second).toHaveTextContent('1 item · 1 vendor');
    expect(second).toHaveTextContent('CANCELLED');
    expect(screen.queryByText('No orders yet')).not.toBeInTheDocument();
  });
});
