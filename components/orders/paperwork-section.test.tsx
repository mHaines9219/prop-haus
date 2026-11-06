import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDocument } from '@/lib/forms/documents';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { PaperworkSection } from './paperwork-section';

function doc(over: Partial<OrderDocument> = {}): OrderDocument {
  return {
    id: 'd1',
    orgId: 'org-1',
    orderId: 'o1',
    vendorId: 'omega',
    vendorFormId: 'vf1',
    kind: 'rental_agreement',
    label: 'Rental agreement',
    status: 'filled',
    storagePath: 'org-1/o1/d1.pdf',
    signedStoragePath: null,
    anvilPacketEid: null,
    anvilDocumentGroupEid: null,
    signUrl: null,
    error: null,
    createdAt: '2026-11-06T18:00:00Z',
    updatedAt: '2026-11-06T18:00:00Z',
    ...over,
  };
}

function mount(documents: OrderDocument[], authorized = true) {
  return render(
    <PaperworkSection
      orderId="o1"
      documents={documents}
      vendorNames={{ omega: 'Omega Cinema Props' }}
      authorized={authorized}
    />,
  );
}

function row(label: string) {
  return screen.getByText(label).closest('div.flex-col') as HTMLElement;
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetNavigation();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => vi.unstubAllGlobals());

describe('PaperworkSection', () => {
  it('says the forms are filled from the profile and the user signs, never that Prop Haus signs', () => {
    const { container } = mount([]);
    expect(screen.getByRole('heading', { name: 'Paperwork' })).toBeInTheDocument();
    expect(screen.getByText('Filled from your profile. You sign.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/prop haus (signs|insures|brokers)|we sign/i);
  });

  it('offers to fill paperwork when authorized and nothing is filled, and refreshes after', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    mount([]);
    expect(screen.getByText('No forms filled for this order yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fill paperwork' }));

    expect(await screen.findByRole('button', { name: 'Filling' })).toBeDisabled();
    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/orders/o1/paperwork', { method: 'POST' });
    expect(screen.getByRole('button', { name: 'Fill paperwork' })).toBeEnabled();
  });

  it('points an unauthorized org to the order profile and offers no fill button', () => {
    mount([], false);
    expect(screen.getByText(/Forms are not filled until you authorize it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'order profile' })).toHaveAttribute('href', '/account/profile');
    expect(screen.queryByRole('button', { name: 'Fill paperwork' })).toBeNull();
  });

  it('names each row by vendor and form, falling back to the vendor id', () => {
    mount([doc(), doc({ id: 'd2', vendorId: 'eclectic', label: 'COI request' })]);
    expect(row('Rental agreement')).toHaveTextContent('Omega Cinema Props · Rental agreement');
    expect(row('COI request')).toHaveTextContent('eclectic · COI request');
  });

  it('links a form awaiting signature to its sign page', () => {
    mount([doc({ status: 'awaiting_signature' })]);
    const r = row('Rental agreement');
    expect(within(r).getByRole('link', { name: 'Sign' })).toHaveAttribute('href', '/orders/o1/sign/d1');
    expect(within(r).getByText('SIGN NEEDED')).toBeInTheDocument();
  });

  it('offers download for a filled or signed PDF and nothing to download without one', () => {
    mount([
      doc(),
      doc({ id: 'd2', label: 'W-9 request', storagePath: null, signedStoragePath: 'org-1/o1/d2-signed.pdf' }),
      doc({ id: 'd3', label: 'Credit application', storagePath: null, status: 'failed', error: 'Template missing' }),
    ]);
    expect(within(row('Rental agreement')).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/forms/d1/download',
    );
    expect(within(row('W-9 request')).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/forms/d2/download',
    );
    const failed = row('Credit application');
    expect(within(failed).queryByRole('link', { name: 'Download' })).toBeNull();
    expect(within(failed).getByText('Template missing')).toBeInTheDocument();
  });

  it('tells the user a manual form needs their wet signature', () => {
    mount([doc({ status: 'manual' })]);
    expect(
      within(row('Rental agreement')).getByText('This vendor needs a wet signature. Download, sign, and return it to them.'),
    ).toBeInTheDocument();
  });

  it('never offers to refill a signed form', () => {
    mount([doc({ status: 'signed' })]);
    const r = row('Rental agreement');
    expect(within(r).queryByRole('button', { name: 'Refill' })).toBeNull();
    expect(within(r).getByText('SIGNED')).toBeInTheDocument();
  });

  it('refills one form and only that row shows progress', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    mount([doc(), doc({ id: 'd2', label: 'COI request' })]);
    fireEvent.click(within(row('COI request')).getByRole('button', { name: 'Refill' }));

    expect(await within(row('COI request')).findByRole('button', { name: 'Refilling' })).toBeDisabled();
    expect(within(row('Rental agreement')).getByRole('button', { name: 'Refill' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith('/api/forms/d2/refill', { method: 'POST' });

    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
  });

  it('shows the server error when a refill is refused, and a generic one otherwise', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Profile incomplete.' }), { status: 422 }));
    mount([doc()]);
    fireEvent.click(screen.getByRole('button', { name: 'Refill' }));
    expect(await screen.findByText('Profile incomplete.')).toBeInTheDocument();
    expect(nav.router.refresh).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: 'Refill' }));
    expect(await screen.findByText('The request did not go through. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('Profile incomplete.')).toBeNull();
  });

  it('shows the generic error when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    mount([]);
    fireEvent.click(screen.getByRole('button', { name: 'Fill paperwork' }));
    expect(await screen.findByText('The request did not go through. Try again.')).toBeInTheDocument();
  });
});
