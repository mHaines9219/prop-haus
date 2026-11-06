import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '@/lib/booking/machine';
import { inquiryPacket } from '@/lib/booking/packet';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { BookingFlow } from './booking-flow';

// One box per house, three lanes each, and the sandbox buttons that move a
// house forward. The buttons offered are whatever the machine allows.

const CARD = { id: 'sbx_pm_o1', brand: 'Visa', last4: '4242', setupIntentId: 'sbx_seti_o1', savedAt: '2026-11-06T18:00:00Z' };

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b-omega',
    orderId: 'o1',
    vendorId: 'omega',
    vendorName: 'Omega Cinema Props',
    stage: 'inquiry_sent',
    packet: inquiryPacket({ vendorName: 'Omega Cinema Props', w9OnFile: false }),
    extras: [],
    history: [{ event: 'open', from: null, to: 'inquiry_sent', at: '2026-11-06T18:00:00Z' }],
    createdAt: '2026-11-06T18:00:00Z',
    updatedAt: '2026-11-06T18:00:00Z',
    ...over,
  };
}

function mount(bookings: Booking[], over: Partial<Parameters<typeof BookingFlow>[0]> = {}) {
  return render(
    <BookingFlow
      orderId="o1"
      bookings={bookings}
      card={CARD}
      sandbox
      canAdvance
      rentalStart="2026-12-01"
      today="2026-11-06"
      suggestedCents={{ omega: 27_000 }}
      {...over}
    />,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetNavigation();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ bookings: [] }), { status: 200 }));
});

afterEach(() => vi.unstubAllGlobals());

describe('BookingFlow', () => {
  it('renders nothing for an order with no bookings', () => {
    const { container } = mount([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens on the inquiry: card saved, nothing charged, the packet listed, nothing sent', () => {
    mount([booking()]);
    expect(screen.getByText('Card saved: Visa ···· 4242. No charge until pickup.')).toBeInTheDocument();
    const box = screen.getByRole('article', { name: 'Omega Cinema Props' });
    expect(within(box).getByText('Card saved. No charge, no hold.')).toBeInTheDocument();
    expect(
      within(box).getByText(
        'Inquiry packet: Production info sheet · W-9 (to follow) · Payment method on file · Proof of insurability from ATHOS.',
      ),
    ).toBeInTheDocument();
    expect(within(box).getByText('Inquiry written and kept on this order. Not sent.')).toBeInTheDocument();
    expect(within(box).getByText('Inquiry out', { selector: 'li span' }).closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('confirms a house with the total typed in, then refreshes the page', async () => {
    mount([booking()]);
    const total = screen.getByLabelText('Omega Cinema Props total in dollars');
    expect(total).toHaveValue('270.00');
    fireEvent.change(total, { target: { value: '310.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'House confirms' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/orders/o1/bookings/omega');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ event: 'confirm', amountCents: 31_050 });
  });

  it('says when the hold waits for pickup to come closer', () => {
    mount([booking({ stage: 'coi_issued', amountCents: 27_000 })]);
    expect(
      screen.getByText('Hold of $270.00 is due Nov 25. A hold lasts about 7 days, so it waits until pickup is that close.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place hold' })).toBeInTheDocument();
  });

  it('offers capture or a lapse on a held house, and prints the certificate', () => {
    mount([
      booking({
        stage: 'hold_placed',
        amountCents: 27_000,
        hold: { id: 'h', amountCents: 27_000, placedAt: '2026-11-25T18:00:00Z', expiresAt: '2026-12-02T18:00:00Z' },
        certificate: {
          certificateNumber: 'SBX-O1-OMEGA',
          issuer: 'ATHOS (sandbox)',
          issuedAt: '2026-11-06T18:05:00Z',
          holderName: 'Omega Cinema Props',
          additionalInsuredWording: 'Omega Cinema Props is named as additional insured and loss payee for rented property.',
          glLimit: 1_000_000,
          aggregateLimit: 2_000_000,
          coverageStart: '2026-12-01',
          coverageEnd: '2026-12-05',
        },
      }),
    ]);
    expect(screen.getByText('Hold of $270.00 on Visa ···· 4242. Lapses Dec 2.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'COI SBX-O1-OMEGA issued by ATHOS (sandbox), naming Omega Cinema Props. $1,000,000 per occurrence, $2,000,000 aggregate. Covers Dec 1 to Dec 5.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Pickup: capture and pay out',
      'Let hold lapse',
    ]);
  });

  it('prints one receipt once a house is captured, and takes a later charge', async () => {
    mount([
      booking({
        stage: 'captured',
        amountCents: 27_000,
        capture: { chargeId: 'c', transferId: 't', amountCents: 27_000, feeCents: 2_700, payoutCents: 24_300, capturedAt: '2026-12-01T18:00:00Z' },
      }),
      booking({ id: 'b-hpr', vendorId: 'hpr', vendorName: 'Hand Prop Room', stage: 'declined', declineNote: 'Out on another show.' }),
    ]);
    expect(screen.getByText('Captured $270.00. $243.00 paid to Omega Cinema Props, $27.00 fee.')).toBeInTheDocument();
    const receipt = screen.getByLabelText('Receipt');
    expect(within(receipt).getByText('Charged to Visa ···· 4242').nextSibling).toHaveTextContent('$270.00');
    expect(within(receipt).getByText('Prop Haus fee').nextSibling).toHaveTextContent('$27.00');

    const declined = screen.getByRole('article', { name: 'Hand Prop Room' });
    expect(within(declined).getByText('Nothing held, nothing charged.')).toBeInTheDocument();
    expect(within(declined).getByText('Nothing further for this house.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('What the charge is for'), { target: { value: 'late_fee' } });
    fireEvent.change(screen.getByLabelText('Charge amount in dollars'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a charge' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      event: 'charge_extra',
      kind: 'late_fee',
      amountCents: 5_000,
    });
  });

  it('shows the server\'s reason when an advance is refused, and no buttons for someone who cannot advance', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'This booking already moved. Reload to see where it is.' }), { status: 409 }));
    const { unmount } = mount([booking()]);
    fireEvent.click(screen.getByRole('button', { name: 'House declines' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This booking already moved. Reload to see where it is.');
    expect(nav.router.refresh).not.toHaveBeenCalled();
    unmount();

    mount([booking()], { canAdvance: false });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Inquiry written and kept on this order. Not sent.')).toBeInTheDocument();
  });
});
