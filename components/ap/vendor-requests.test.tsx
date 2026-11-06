import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundMessage } from '@/lib/outreach/send';
import { VendorRequests, headline } from './vendor-requests';

function msg(over: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    id: 'm-omega',
    orderId: 'o1',
    vendorId: 'omega',
    vendorName: 'Omega Cinema Props',
    to: 'rentals@omega.example',
    cc: [],
    replyTo: 'order-o1@reply.prophaus.example',
    subject: 'Rental request: Credenza',
    bodyText: 'Hi Omega,\n\nWe would like to rent the credenza.',
    bodyHtml: '<p>Hi Omega</p>',
    attachments: [],
    status: 'sent',
    sentAt: '2026-11-06T18:30:00Z',
    edited: false,
    createdAt: '2026-11-06T18:00:00Z',
    ...over,
  };
}

function rowFor(vendor: string) {
  return screen.getByText(vendor).closest('div.flex.items-center') as HTMLElement;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('VendorRequests', () => {
  it('renders nothing for an order with no outreach', () => {
    const { container } = render(<VendorRequests initial={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each vendor with its address, edited mark and status, under a headline', () => {
    render(
      <VendorRequests
        initial={[
          msg(),
          msg({ id: 'm-newel', vendorName: 'Newel', to: '', edited: true, status: 'sending', sentAt: undefined }),
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Vendor requests' })).toBeInTheDocument();
    expect(screen.getByText('Sending to 2 vendors.')).toBeInTheDocument();
    expect(within(rowFor('Omega Cinema Props')).getByText('rentals@omega.example')).toBeInTheDocument();
    expect(within(rowFor('Omega Cinema Props')).getByText('SENT')).toBeInTheDocument();
    expect(within(rowFor('Newel')).getByText('No address on file · edited')).toBeInTheDocument();
    expect(within(rowFor('Newel')).getByText('SENDING')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('opens the sent email read-only in the drawer and closes it', async () => {
    render(<VendorRequests initial={[msg()]} />);
    fireEvent.click(within(rowFor('Omega Cinema Props')).getByRole('button', { name: 'View' }));

    const d = screen.getByRole('dialog', { name: 'Email to Omega Cinema Props' });
    expect(within(d).getByText('Email sent')).toBeInTheDocument();
    expect(within(d).getByText('Rental request: Credenza')).toBeInTheDocument();
    expect(within(d).queryByRole('textbox')).toBeNull();

    fireEvent.click(within(d).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('retries a failed send and replaces the row with what the server returns', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<VendorRequests initial={[msg({ status: 'failed', sentAt: undefined, error: 'Bounced' })]} />);
    expect(screen.getByText('Sent to 0 of 1 vendor. 1 failed.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/outreach/m-omega/retry',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );

    resolve(new Response(JSON.stringify({ message: msg() }), { status: 200 }));
    expect(await screen.findByText('Sent to 1 vendor.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry|Sending/ })).toBeNull();
    expect(within(rowFor('Omega Cinema Props')).getByText('SENT')).toBeInTheDocument();
  });

  it('shows the server reason when a retry is refused and keeps the row failed', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'No address on file.' }), { status: 422 }));
    render(<VendorRequests initial={[msg({ status: 'failed' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No address on file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
  });

  it('shows a generic message when the retry cannot reach the server', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    render(<VendorRequests initial={[msg({ status: 'failed' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Retry did not go through.')).toBeInTheDocument();
  });
});

describe('headline', () => {
  it.each([
    [['sent', 'sent', 'sent'], 'Sent to 3 vendors.'],
    [['sent'], 'Sent to 1 vendor.'],
    [['sent', 'failed', 'sent'], 'Sent to 2 of 3 vendors. 1 failed.'],
    [['sent', 'sending'], 'Sending to 2 vendors.'],
    [['sandbox', 'sandbox'], 'Sandbox. Written for 2 vendors, none sent.'],
  ])('%j reads %s', (statuses, expected) => {
    expect(headline(statuses.map((status) => ({ status })))).toBe(expected);
  });
});
