import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCart, type CartLine } from '@/lib/cart-store';
import type { OrderDefaults } from '@/lib/order-profile';
import type { Draft } from '@/lib/outreach/compose';
import { makePropItem } from '@/test/fixtures/catalog';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import CartPage from './page';

// The cart is the one-click surface: it reads readiness from the profile,
// never grows a form of its own, drafts the vendor emails before the click,
// and the click sends exactly one request carrying any edits.

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/components/ap/site-footer', () => ({ SiteFooter: () => null }));

type DrawerStubProps = {
  message: { vendorName: string; subject: string; bodyText: string } | null;
  onClose: () => void;
  editing?: { edited: boolean; onChange: (p: { subject?: string; bodyText?: string }) => void; onReset: () => void };
};
vi.mock('@/components/ap/outreach-drawer', () => ({
  OutreachDrawer: ({ message, onClose, editing }: DrawerStubProps) =>
    message ? (
      <div role="dialog" aria-label={`Email to ${message.vendorName}`}>
        <input aria-label="Subject" value={message.subject} onChange={(e) => editing?.onChange({ subject: e.target.value })} />
        <textarea aria-label="Body" value={message.bodyText} onChange={(e) => editing?.onChange({ bodyText: e.target.value })} />
        {editing?.edited && (
          <button type="button" onClick={editing.onReset}>
            Reset to draft
          </button>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const READY_DEFAULTS: OrderDefaults & { rentalWindowDays?: number } = {
  rentalStart: '2026-09-03',
  rentalEnd: '2026-09-10',
  rentalWindowDays: 7,
  deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
  deliveryNotes: 'Dock B, ask for Sam',
};

const readyResponse = (defaults = READY_DEFAULTS) => json({ ready: true, missing: [], defaults });
const incompleteResponse = (missing: string[]) => json({ ready: false, missing, defaults: {} });

const draft = (over: Partial<Draft> = {}): Draft => ({
  vendorId: 'omega',
  vendorName: 'Omega Cinema Props',
  to: 'rentals@omega.example',
  needsVendorAddress: false,
  cc: [],
  replyTo: 'order-1@reply.prophaus.example',
  subject: 'Rental request — Nocturne Pictures',
  bodyText: 'Hi Omega,\n\nWe would like to rent the credenza.',
  bodyHtml: '<p>Hi Omega</p>',
  attachments: [],
  items: [],
  warnings: [],
  ...over,
});

const DRAFTS = [
  draft(),
  draft({
    vendorId: 'hpr',
    vendorName: 'Hand Prop Room',
    to: '',
    needsVendorAddress: true,
    subject: 'Rental request — lamp',
    warnings: ['No email on file for this vendor; the request goes to ops.'],
  }),
];

/** Readiness answers ready unless overridden; checkout and preview are routed separately. */
function stubRoutes(
  checkout: Handler = () => json({ id: 'order-1' }, 201),
  readiness: Handler = () => readyResponse(),
  preview: Handler = () => json({ drafts: DRAFTS }),
) {
  return stubFetch((url, init) =>
    url === '/api/checkout' ? checkout(url, init) : url === '/api/checkout/preview' ? preview(url, init) : readiness(url, init),
  );
}

const credenza = makePropItem();
const lamp = makePropItem({
  source: 'hpr',
  sourceId: '777',
  name: 'Brass floor lamp',
  images: [],
  sourceUrl: 'https://www.hpr.com/item/777',
});
const line = (item: typeof credenza): CartLine => ({ item });
/** The text link for a line (the image is a second link with the same name). */
const nameLink = (name: string) => screen.getByText(name, { selector: 'a' });
const placeOrder = () => screen.findByRole('button', { name: /^Place order and send/ });

const UUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  resetNavigation();
  useCart.setState({ lines: [line(credenza), line(lamp)] });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderCart() {
  const view = render(<CartPage />);
  await screen.findByRole('heading', { name: 'Cart' });
  return view;
}

describe('empty cart', () => {
  it('shows the empty state with a link back to the catalog', async () => {
    useCart.setState({ lines: [] });
    stubRoutes();
    await renderCart();
    expect(screen.getByText('0 items')).toBeInTheDocument();
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /^Place order and send/ })).not.toBeInTheDocument();
  });
});

describe('lines', () => {
  it('renders every line with its vendor and counts the vendors', async () => {
    stubRoutes();
    await renderCart();
    expect(screen.getByText('2 items · 2 vendors')).toBeInTheDocument();
    expect(nameLink('Mid-century walnut credenza')).toHaveAttribute('href', '/item/omega/12345');
    expect(nameLink('Brass floor lamp')).toHaveAttribute('href', '/item/hpr/777');
    expect(screen.getByText('Omega Cinema Props')).toBeInTheDocument();
    expect(screen.getByText('Hand Prop Room')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mid-century walnut credenza' })).toHaveAttribute('src', credenza.images[0]);
    expect(screen.queryByRole('img', { name: 'Brass floor lamp' })).not.toBeInTheDocument();
  });

  it('counts one vendor when every line shares a source', async () => {
    useCart.setState({ lines: [line(credenza), line(makePropItem({ sourceId: '2', name: 'Other credenza' }))] });
    stubRoutes();
    await renderCart();
    expect(screen.getByText('2 items · 1 vendor')).toBeInTheDocument();
  });

  it('falls back to the raw source for an unknown vendor', async () => {
    useCart.setState({ lines: [line(makePropItem({ source: 'mystery' as never, sourceId: '9' }))] });
    stubRoutes();
    await renderCart();
    expect(screen.getByText('mystery')).toBeInTheDocument();
  });

  it('removes a single line', async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderCart();
    const lampRow = nameLink('Brass floor lamp').closest('div.flex.gap-4')!;
    await user.click(within(lampRow as HTMLElement).getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('Brass floor lamp', { selector: 'a' })).not.toBeInTheDocument();
    expect(nameLink('Mid-century walnut credenza')).toBeInTheDocument();
    expect(useCart.getState().lines.map((l) => l.item.id)).toEqual(['omega-12345']);
    expect(screen.getByText('1 item · 1 vendor')).toBeInTheDocument();
  });

  it('clears the whole cart', async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderCart();
    await user.click(screen.getByRole('button', { name: 'Clear cart' }));
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(useCart.getState().lines).toEqual([]);
  });
});

describe('readiness', () => {
  it('reads the profile once on mount', async () => {
    const fetchMock = stubRoutes();
    await renderCart();
    await screen.findByRole('button', { name: /^Place order and send/ });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/checkout/readiness');
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });

  it('shows a loading line until the profile answers', async () => {
    stubFetch(() => new Promise<Response>(() => {}));
    await renderCart();
    expect(screen.getByText('Reading your profile…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Place order and send/ })).not.toBeInTheDocument();
  });

  it('shows the defaults the click will use when ready', async () => {
    stubRoutes();
    await renderCart();
    expect(await screen.findByText('Sep 3 – Sep 10, 2026 · 7 days from the next business day')).toBeInTheDocument();
    expect(screen.getByText('4100 W Alameda Ave, Burbank, CA 91505')).toBeInTheDocument();
    expect(screen.getByText('Dock B, ask for Sam')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Place order and send/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Change for this order' })).toBeInTheDocument();
  });

  it('explains when the profile has no default window or address', async () => {
    stubRoutes(undefined, () => readyResponse({}));
    await renderCart();
    expect(await screen.findByText('No default window — set one for this order')).toBeInTheDocument();
    expect(screen.getByText('—', { selector: 'dd' })).toBeInTheDocument();
  });

  it('shows delivery notes in place of a missing address', async () => {
    stubRoutes(undefined, () => readyResponse({ deliveryNotes: 'Meet at the gate' }));
    await renderCart();
    expect(await screen.findByText('Meet at the gate')).toBeInTheDocument();
  });

  it('lists what is missing and links to the profile', async () => {
    stubRoutes(undefined, () => incompleteResponse(['Company legal name', 'Authorization to complete forms']));
    await renderCart();
    expect(await screen.findByText('2 things missing before one-click')).toBeInTheDocument();
    expect(screen.getByText('· Company legal name')).toBeInTheDocument();
    expect(screen.getByText('· Authorization to complete forms')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Complete your order profile →' })).toHaveAttribute('href', '/account/profile');
    expect(screen.queryByRole('button', { name: /^Place order and send/ })).not.toBeInTheDocument();
  });

  it('uses the singular for one missing item', async () => {
    stubRoutes(undefined, () => incompleteResponse(['Delivery address']));
    await renderCart();
    expect(await screen.findByText('1 thing missing before one-click')).toBeInTheDocument();
  });

  it('points a signed-out visitor at login with a return path', async () => {
    stubRoutes(undefined, () => json({ error: 'not signed in' }, 401));
    await renderCart();
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/login?next=/cart');
    expect(screen.getByText(/to place an order/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Place order and send/ })).not.toBeInTheDocument();
  });

  it.each([
    ['a 500', () => json({ error: 'boom' }, 500)],
    ['a network failure', () => Promise.reject(new TypeError('offline')) as Promise<Response>],
  ])('treats %s as an unreadable profile', async (_label, readiness) => {
    stubRoutes(undefined, readiness);
    await renderCart();
    expect(await screen.findByText('· Order profile could not be read')).toBeInTheDocument();
  });
});

describe('placing the order', () => {
  it('POSTs the lines with a stable idempotency key, clears the cart and opens the order', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));

    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/order-1'));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/checkout')!;
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(call[1]?.body as string)).toEqual({
      lines: [
        {
          itemId: 'omega-12345',
          source: 'omega',
          sourceId: '12345',
          name: 'Mid-century walnut credenza',
          image: 'https://omegacinemaprops.com/img/12345.jpg',
          sourceUrl: 'https://omegacinemaprops.com/item/12345',
          vendor: 'Omega Cinema Props',
        },
        {
          itemId: 'hpr-777',
          source: 'hpr',
          sourceId: '777',
          name: 'Brass floor lamp',
          image: null,
          sourceUrl: 'https://www.hpr.com/item/777',
          vendor: 'Hand Prop Room',
        },
      ],
      messages: [],
      idempotencyKey: UUID,
    });
    expect(useCart.getState().lines).toEqual([]);
  });

  it('disables the button while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubRoutes(() => new Promise<Response>((r) => (resolve = r)));
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));
    expect(screen.getByRole('button', { name: 'Placing order and sending…' })).toBeDisabled();
    resolve(json({ id: 'order-1' }, 201));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
  });

  it('sends one request on a double click', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(() => new Promise<Response>(() => {}));
    await renderCart();
    await user.dblClick(await screen.findByRole('button', { name: /^Place order and send/ }));
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout')).toHaveLength(1);
  });

  it('on 422 shows the missing list from a fresh readiness read and keeps the cart', async () => {
    const user = userEvent.setup();
    let reads = 0;
    const fetchMock = stubRoutes(
      () => json({ error: 'profile incomplete', missing: ['Delivery address'] }, 422),
      () => (reads++ === 0 ? readyResponse() : incompleteResponse(['Delivery address'])),
    );
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));

    expect(await screen.findByText('Your order profile is missing something.')).toBeInTheDocument();
    expect(await screen.findByText('· Delivery address')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Complete your order profile →' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/readiness')).toHaveLength(2);
    expect(useCart.getState().lines).toHaveLength(2);
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('on 500 shows an error, keeps the cart and re-enables the button', async () => {
    const user = userEvent.setup();
    stubRoutes(() => json({ error: 'db down' }, 500));
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));
    expect(await screen.findByText('Something went wrong — please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Place order and send/ })).toBeEnabled();
    expect(useCart.getState().lines).toHaveLength(2);
    expect(nameLink('Brass floor lamp')).toBeInTheDocument();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('on a network failure shows the generic error', async () => {
    const user = userEvent.setup();
    stubRoutes(() => Promise.reject(new TypeError('offline')));
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));
    expect(await screen.findByText('Something went wrong — please try again.')).toBeInTheDocument();
  });

  // A 401 from /api/checkout (session expired after the page loaded) renders
  // the generic "Something went wrong" line; nothing points at /login.
  it.fails('on 401 points the user at login', async () => {
    const user = userEvent.setup();
    stubRoutes(() => json({ error: 'not signed in' }, 401));
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));
    await screen.findByText(/went wrong|sign in/i);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login?next=/cart');
  });
});

describe('per-order overrides', () => {
  // The Start / End / Delivery notes <label>s have no htmlFor and do not wrap
  // their inputs, so the fields have no accessible name.
  it.fails('labels the override fields', async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderCart();
    await user.click(await screen.findByRole('button', { name: 'Change for this order' }));
    expect(screen.getByLabelText('Start')).toBeInTheDocument();
  });

  it('sends the override window and notes with the order and previews them', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    const { container } = await renderCart();
    await user.click(await screen.findByRole('button', { name: 'Change for this order' }));

    const dates = container.querySelectorAll('input[type=date]');
    expect(dates).toHaveLength(2);
    await user.type(dates[0], '2026-09-05');
    await user.type(dates[1], '2026-09-12');
    await user.type(screen.getByPlaceholderText('Access instructions, who to ask for…'), '  Gate 3  ');

    expect(screen.getByText('Sep 5 – Sep 12, 2026')).toBeInTheDocument();
    expect(screen.getByText('Gate 3', { selector: 'dd', exact: false })).toBeInTheDocument();
    expect(screen.queryByText('Dock B, ask for Sam')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Place order and send/ }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);
    expect(body).toMatchObject({ rentalStart: '2026-09-05', rentalEnd: '2026-09-12', deliveryNotes: 'Gate 3' });
  });

  it('previews a one-sided window', async () => {
    const user = userEvent.setup();
    stubRoutes();
    const { container } = await renderCart();
    await user.click(await screen.findByRole('button', { name: 'Change for this order' }));
    await user.type(container.querySelectorAll('input[type=date]')[0], '2026-09-05');
    expect(screen.getByText('From Sep 5, 2026')).toBeInTheDocument();
  });

  it('toggles back to the defaults', async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderCart();
    await user.click(await screen.findByRole('button', { name: 'Change for this order' }));
    await user.click(screen.getByRole('button', { name: 'Use my defaults' }));
    expect(screen.queryByPlaceholderText('Access instructions, who to ask for…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change for this order' })).toBeInTheDocument();
  });
});

describe('Review the emails', () => {
  const disclosure = () => screen.findByRole('button', { name: 'Review the emails' });
  const previewCalls = (fn: ReturnType<typeof stubRoutes>) => fn.mock.calls.filter(([url]) => url === '/api/checkout/preview');
  const checkoutBody = (fn: ReturnType<typeof stubRoutes>) =>
    JSON.parse(fn.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);

  it('is only offered once the profile is ready', async () => {
    stubRoutes(undefined, () => incompleteResponse(['Delivery address']));
    await renderCart();
    await screen.findByText('· Delivery address');
    expect(screen.queryByRole('button', { name: 'Review the emails' })).not.toBeInTheDocument();
  });

  it('stays closed and does not draft until opened', async () => {
    const fetchMock = stubRoutes();
    await renderCart();
    expect(await disclosure()).toHaveAttribute('aria-expanded', 'false');
    await placeOrder();
    expect(previewCalls(fetchMock)).toHaveLength(0);
  });

  it('drafts one email per vendor from the cart when opened', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(undefined, undefined, () => new Promise<Response>(() => {}));
    await renderCart();
    await user.click(await disclosure());
    expect(screen.getByRole('button', { name: 'Review the emails' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Writing the drafts…')).toBeInTheDocument();

    await waitFor(() => expect(previewCalls(fetchMock)).toHaveLength(1));
    const [, init] = previewCalls(fetchMock)[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      lines: [
        expect.objectContaining({ itemId: 'omega-12345', vendor: 'Omega Cinema Props' }),
        expect.objectContaining({ itemId: 'hpr-777', vendor: 'Hand Prop Room' }),
      ],
    });
  });

  it('lists each draft with its recipient, subject and warnings', async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderCart();
    await user.click(await disclosure());
    expect(await screen.findByText('Rental request — Nocturne Pictures')).toBeInTheDocument();
    expect(screen.getByText('rentals@omega.example')).toBeInTheDocument();
    expect(screen.getByText('No address on file')).toBeInTheDocument();
    expect(screen.getByText('No email on file for this vendor; the request goes to ops.')).toBeInTheDocument();
    expect(screen.getAllByText('Draft')).toHaveLength(2);
    expect(screen.getByText(/Sent as written with the click/)).toBeInTheDocument();
    expect(screen.queryByText('Writing the drafts…')).not.toBeInTheDocument();
  });

  it('reports when the drafts cannot be written', async () => {
    const user = userEvent.setup();
    stubRoutes(undefined, undefined, () => json({ error: 'composer down' }, 500));
    await renderCart();
    await user.click(await disclosure());
    expect(await screen.findByText('The drafts did not load. Try again.')).toBeInTheDocument();
  });

  it('collapses again on a second click', async () => {
    const user = userEvent.setup();
    stubRoutes();
    await renderCart();
    await user.click(await disclosure());
    await screen.findByText('Rental request — Nocturne Pictures');
    await user.click(screen.getByRole('button', { name: 'Review the emails' }));
    expect(screen.queryByText('Rental request — Nocturne Pictures')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review the emails' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a draft, sends an edit with the click, and marks the row edited', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    await renderCart();
    await user.click(await disclosure());
    await user.click(await screen.findByRole('button', { name: /Omega Cinema Props/ }));

    const dialog = screen.getByRole('dialog', { name: 'Email to Omega Cinema Props' });
    const subject = within(dialog).getByLabelText('Subject');
    expect(subject).toHaveValue('Rental request — Nocturne Pictures');
    await user.clear(subject);
    await user.type(subject, 'Hold request — Nocturne');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByText('Hold request — Nocturne')).toBeInTheDocument();
    expect(screen.getAllByText('Draft')).toHaveLength(1);

    await user.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/order-1'));
    expect(checkoutBody(fetchMock).messages).toEqual([
      { vendorId: 'omega', subject: 'Hold request — Nocturne', bodyText: 'Hi Omega,\n\nWe would like to rent the credenza.' },
    ]);
  });

  it('drops an edit that returns to the draft wording, and on reset', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    await renderCart();
    await user.click(await disclosure());
    await user.click(await screen.findByRole('button', { name: /Omega Cinema Props/ }));
    const dialog = screen.getByRole('dialog');
    const body = within(dialog).getByLabelText('Body');
    await user.type(body, ' Thanks.');
    expect(within(dialog).getByRole('button', { name: 'Reset to draft' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Reset to draft' }));
    expect(within(dialog).queryByRole('button', { name: 'Reset to draft' })).not.toBeInTheDocument();
    expect(body).toHaveValue('Hi Omega,\n\nWe would like to rent the credenza.');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Edited')).not.toBeInTheDocument();

    await user.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
    expect(checkoutBody(fetchMock).messages).toEqual([]);
  });
});
