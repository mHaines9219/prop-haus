// /vendor/respond: the confirmation a vendor sees, the no-op case, and the expired page.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RespondResult } from '@/lib/vendor-respond';
import VendorRespondPage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/vendor-respond', () => ({ respondToVendorLink: vi.fn() }));

const respond = vi.mocked(await import('@/lib/vendor-respond')).respondToVendorLink;

function props(t?: string | string[]) {
  return { searchParams: Promise.resolve(t === undefined ? {} : { t }) };
}

const CONFIRMED: RespondResult = {
  ok: true,
  vendorName: 'Omega Cinema Props',
  itemName: 'Walnut credenza',
  action: 'available',
  status: 'confirmed',
  changed: true,
  flip: { action: 'unavailable', url: 'https://prophaus.example/vendor/respond?t=flip' },
};

beforeEach(() => respond.mockReset());

describe('VendorRespondPage', () => {
  it('confirms the vendor, the item and the status, with the other answer one link away', async () => {
    respond.mockResolvedValue(CONFIRMED);
    render(await VendorRespondPage(props('tok')));
    expect(respond).toHaveBeenCalledWith('tok');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Thanks, Omega Cinema Props.');
    expect(screen.getByText('Walnut credenza')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Marked on the order.')).toBeInTheDocument();
    const flip = screen.getByRole('link', { name: /Item unavailable/ });
    expect(flip).toHaveAttribute('href', 'https://prophaus.example/vendor/respond?t=flip');
  });

  it('says nothing changed when the line already carried that status', async () => {
    respond.mockResolvedValue({ ...CONFIRMED, action: 'unavailable', status: 'unavailable', changed: false, flip: { action: 'available', url: 'x' } });
    render(await VendorRespondPage(props('tok')));
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    expect(screen.getByText('Already marked. Nothing changed.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Item available/ })).toBeInTheDocument();
  });

  it.each(['invalid', 'expired', 'not_found'] as const)('renders the expired page for a %s token', async (reason) => {
    respond.mockResolvedValue({ ok: false, reason });
    render(await VendorRespondPage(props('tok')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired.');
    expect(screen.queryByRole('link', { name: /Item/ })).toBeNull();
  });

  it('renders the expired page without a lookup when there is no token', async () => {
    render(await VendorRespondPage(props()));
    expect(respond).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired.');
    render(await VendorRespondPage(props(['a', 'b'])));
    expect(respond).not.toHaveBeenCalled();
  });
});
