// /vendor/respond: the ask with its one button, the confirmation, the no-op, the failure, and the expired page.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadResult, VendorLine } from '@/lib/vendor-respond';
import VendorRespondPage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/vendor-respond', () => ({ readVendorLink: vi.fn(), respondToVendorLink: vi.fn() }));

const mod = vi.mocked(await import('@/lib/vendor-respond'));

function props(q: { t?: string | string[]; r?: string } = {}) {
  return { searchParams: Promise.resolve(q) };
}

const LINE: VendorLine = {
  vendorName: 'Omega Cinema Props',
  itemName: 'Walnut credenza',
  status: 'pending',
  action: 'available',
  flip: { action: 'unavailable', url: 'https://prophaus.example/vendor/respond?t=flip' },
};
const READ: ReadResult = {
  ok: true,
  line: LINE,
  orgId: 'org-1',
  claims: { orderId: 'order-1', itemId: 'oi-1', vendorId: 'omega', action: 'available', exp: 1 },
};

beforeEach(() => {
  mod.readVendorLink.mockReset();
  mod.respondToVendorLink.mockReset();
});

describe('VendorRespondPage', () => {
  it('asks with one button and writes nothing on the GET', async () => {
    mod.readVendorLink.mockResolvedValue(READ);
    render(await VendorRespondPage(props({ t: 'tok' })));
    expect(mod.readVendorLink).toHaveBeenCalledWith('tok');
    expect(mod.respondToVendorLink).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello, Omega Cinema Props.');
    expect(screen.getByText('Walnut credenza')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Item available' });
    const form = button.closest('form')!;
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', '/api/vendor/respond');
    expect(form.querySelector('input[name="t"]')).toHaveAttribute('value', 'tok');
  });

  it('confirms the vendor, the item and the new status after the POST, with the other answer one link away', async () => {
    mod.readVendorLink.mockResolvedValue(READ);
    render(await VendorRespondPage(props({ t: 'tok', r: 'changed' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Thanks, Omega Cinema Props.');
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Marked on the order.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Item unavailable/ })).toHaveAttribute('href', 'https://prophaus.example/vendor/respond?t=flip');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing changed when the line already carried that status', async () => {
    mod.readVendorLink.mockResolvedValue({ ...READ, line: { ...LINE, action: 'unavailable', status: 'unavailable', flip: { action: 'available', url: 'x' } } });
    render(await VendorRespondPage(props({ t: 'tok', r: 'same' })));
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('Already marked. Nothing changed.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Item available/ })).toBeInTheDocument();
  });

  it('offers the button again when the write did not go through', async () => {
    mod.readVendorLink.mockResolvedValue(READ);
    render(await VendorRespondPage(props({ t: 'tok', r: 'error' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('That did not go through.');
    expect(screen.getByRole('button', { name: 'Item available' })).toBeInTheDocument();
  });

  it('renders the failure page, not a crash, when the read throws', async () => {
    mod.readVendorLink.mockRejectedValue(new Error('db down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(await VendorRespondPage(props({ t: 'tok' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('That did not go through.');
    expect(screen.queryByRole('button')).toBeNull();
    err.mockRestore();
  });

  it.each(['invalid', 'expired', 'not_found'] as const)('renders the expired page for a %s token', async (reason) => {
    mod.readVendorLink.mockResolvedValue({ ok: false, reason });
    render(await VendorRespondPage(props({ t: 'tok' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired.');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: /Item/ })).toBeNull();
  });

  it('renders the expired page without a lookup when there is no token', async () => {
    render(await VendorRespondPage(props()));
    expect(mod.readVendorLink).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired.');
    render(await VendorRespondPage(props({ t: ['a', 'b'] })));
    expect(mod.readVendorLink).not.toHaveBeenCalled();
  });
});
