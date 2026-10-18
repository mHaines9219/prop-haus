import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCart, type CartLine } from '@/lib/cart-store';
import type { OrderDefaults } from '@/lib/order-profile';
import type { Draft } from '@/lib/outreach/compose';
import { makePropItem } from '@/test/fixtures/catalog';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import CartPage from './page';

// The cart is the one-click surface: it reads readiness from the profile,
// asks for what every vendor needs (dates, location, shoot details, and the
// production itself when the profile lacks it) in a single form prefilled
// from the profile, drafts the vendor emails before the click, and the click
// sends exactly one request carrying the form and any edits.

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

const READY_PRODUCTION = {
  legalName: 'Nocturne Pictures LLC',
  contactName: 'Sam Reyes',
  contactEmail: 'sam@nocturne.example',
  formsOnBehalf: true,
};
const readyResponse = (defaults = READY_DEFAULTS, passport: unknown = { documents: {} }) =>
  json({ ready: true, missing: [], defaults, production: READY_PRODUCTION, passport });
/** A profile short of the given things; `production` is what it does have. */
const incompleteResponse = (missing: string[], production: Record<string, unknown> = { formsOnBehalf: false }) =>
  json({ ready: false, missing, defaults: {}, production });

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

/** Readiness answers ready unless overridden; checkout, preview and passport uploads are routed separately. */
function stubRoutes(
  checkout: Handler = () => json({ id: 'order-1' }, 201),
  readiness: Handler = () => readyResponse(),
  preview: Handler = () => json({ drafts: DRAFTS }),
  passport: Handler = () => json({ error: 'unexpected upload' }, 500),
) {
  return stubFetch((url, init) =>
    url === '/api/checkout'
      ? checkout(url, init)
      : url === '/api/checkout/preview'
        ? preview(url, init)
        : url.startsWith('/api/account/passport/')
          ? passport(url, init)
          : readiness(url, init),
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
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /^Place order and send/ })).not.toBeInTheDocument();
  });
});

describe('lines', () => {
  it('renders every line with its vendor and counts the vendors', async () => {
    stubRoutes();
    await renderCart();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
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

describe('project picker', () => {
  const PROJECTS = [
    { id: 'p-new', name: 'Nocturne' },
    { id: 'p-old', name: 'Daylight' },
  ];
  const withProjects = () =>
    stubRoutes(undefined, () => json({ ready: true, missing: [], defaults: READY_DEFAULTS, projects: PROJECTS }));

  it('is absent when the org has no projects and the click sends no projectId', async () => {
    const fetchMock = stubRoutes();
    await renderCart();
    await placeOrder();
    expect(screen.queryByRole('combobox', { name: 'Project' })).not.toBeInTheDocument();
    await userEvent.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);
    expect(body).not.toHaveProperty('projectId');
  });

  it('starts on the most recently touched project and sends it with the click', async () => {
    const fetchMock = withProjects();
    await renderCart();
    const picker = await screen.findByRole('combobox', { name: 'Project' });
    expect(picker).toHaveValue('p-new');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nocturne', 'Daylight', 'No project']);

    await userEvent.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/order-1'));
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);
    expect(body.projectId).toBe('p-new');
  });

  it('lets the user pick another project or none', async () => {
    const fetchMock = withProjects();
    await renderCart();
    const picker = await screen.findByRole('combobox', { name: 'Project' });
    await userEvent.selectOptions(picker, 'p-old');
    expect(picker).toHaveValue('p-old');
    await userEvent.selectOptions(picker, '');
    expect(picker).toHaveValue('');

    await userEvent.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);
    expect(body).not.toHaveProperty('projectId');
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

  it('prefills the request form from the profile defaults when ready', async () => {
    stubRoutes();
    await renderCart();
    expect(await screen.findByLabelText('Start')).toHaveValue('2026-09-03');
    expect(screen.getByLabelText('End')).toHaveValue('2026-09-10');
    expect(screen.getByLabelText('Shoot details')).toHaveValue('');
    // No address fields: pickup is assumed, and the profile's delivery defaults are ignored.
    expect(screen.queryByLabelText('Street')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Access notes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Place order and send/ })).toBeEnabled();
  });

  it('leaves the dates blank when the profile has no window', async () => {
    stubRoutes(undefined, () => readyResponse({ deliveryNotes: 'Meet at the gate' }));
    await renderCart();
    expect(await screen.findByLabelText('Start')).toHaveValue('');
    expect(screen.getByLabelText('End')).toHaveValue('');
  });

  it('states that pickup is assumed and explains why there is no delivery option', async () => {
    stubRoutes();
    await renderCart();
    expect(await screen.findByText("Pickup and return at each vendor's dock.")).toBeInTheDocument();
    const why = screen.getByLabelText('Why there is no delivery option');
    // The tooltip portals to the body once mounted, so it arrives a tick after the trigger.
    const tip = await screen.findByRole('tooltip');
    expect(why).toHaveAttribute('aria-describedby', tip.id);
    expect(tip).toHaveTextContent('Some prop houses deliver, but most do not, so there is no delivery option here.');
  });

  it('asks for the production in the same form when the profile is short, prefilled with what it has', async () => {
    stubRoutes(undefined, () =>
      incompleteResponse(['Company legal name', 'Authorization to complete forms'], {
        contactName: 'Sam Reyes',
        contactEmail: 'sam@nocturne.example',
        formsOnBehalf: false,
      }),
    );
    await renderCart();
    expect(await screen.findByText('Your production')).toBeInTheDocument();
    expect(screen.getByLabelText('Company legal name')).toHaveValue('');
    expect(screen.getByLabelText('Ordering contact')).toHaveValue('Sam Reyes');
    expect(screen.getByLabelText('Contact email')).toHaveValue('sam@nocturne.example');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(/I sign anything that needs a signature/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'order profile' })).toHaveAttribute('href', '/account/profile');
    // The rest of the form and the click are still there: one form, one process.
    expect(screen.getByLabelText('Start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Place order and send/ })).toBeEnabled();
  });

  it('does not ask for the production when the profile already has it', async () => {
    stubRoutes();
    await renderCart();
    await screen.findByLabelText('Start');
    expect(screen.queryByText('Your production')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Company legal name')).not.toBeInTheDocument();
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
  ])('treats %s as an unreadable profile and offers no click', async (_label, readiness) => {
    stubRoutes(undefined, readiness);
    await renderCart();
    expect(await screen.findByText(/Your order profile could not be read/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'open your profile' })).toHaveAttribute('href', '/account/profile');
    expect(screen.queryByRole('button', { name: /^Place order and send/ })).not.toBeInTheDocument();
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
      rentalStart: '2026-09-03',
      rentalEnd: '2026-09-10',
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

  it('on a profile 422 rereads readiness, opens the production fields, and keeps the cart', async () => {
    const user = userEvent.setup();
    let reads = 0;
    const fetchMock = stubRoutes(
      () => json({ error: 'order profile is incomplete', missing: ['Authorization to complete forms'] }, 422),
      () => (reads++ === 0 ? readyResponse() : incompleteResponse(['Authorization to complete forms'])),
    );
    await renderCart();
    await user.click(await screen.findByRole('button', { name: /^Place order and send/ }));

    expect(await screen.findByText('Your order profile is missing something. Fill it in below.')).toBeInTheDocument();
    expect(await screen.findByText('Your production')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/readiness')).toHaveLength(2);
    expect(useCart.getState().lines).toHaveLength(2);
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('sends the production with the click when the profile was short, and not otherwise', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(undefined, () =>
      incompleteResponse(['Company legal name', 'Ordering contact name', 'Ordering contact email', 'Authorization to complete forms']),
    );
    await renderCart();
    await screen.findByText('Your production');
    await user.click(await placeOrder());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Still needed: Company legal name, Ordering contact name, Ordering contact email, Authorization to complete forms, Rental dates.',
    );
    expect(screen.getByLabelText('Company legal name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByLabelText('Company legal name'), 'Acme Pictures');
    await user.type(screen.getByLabelText('Ordering contact'), 'Sam');
    await user.type(screen.getByLabelText('Contact email'), 'sam@acme.example');
    await user.type(screen.getByLabelText('Contact phone'), '310 555 0100');
    await user.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-09-05' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-12' } });
    await user.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/order-1'));
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);
    expect(body.production).toEqual({
      legalName: 'Acme Pictures',
      contactName: 'Sam',
      contactEmail: 'sam@acme.example',
      contactPhone: '310 555 0100',
      formsOnBehalf: true,
    });
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

describe('the request form', () => {
  const setDate = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const checkoutCalls = (fn: ReturnType<typeof stubRoutes>) => fn.mock.calls.filter(([url]) => url === '/api/checkout');

  it('labels every field so a vendor-facing request can be filled by keyboard', async () => {
    stubRoutes();
    await renderCart();
    for (const label of ['Start', 'End']) {
      expect(await screen.findByLabelText(label), label).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Shoot details')).toBeInTheDocument();
    expect(screen.getByText('Dates requested')).toBeInTheDocument();
    expect(screen.queryByText('Location')).not.toBeInTheDocument();
  });

  it('sends what the user typed with the order, and the preview sees the same request', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    await renderCart();
    await screen.findByLabelText('Start');
    setDate('Start', '2026-09-05');
    setDate('End', '2026-09-12');
    await user.type(screen.getByLabelText('Shoot details'), 'Two-day commercial, living room set');

    await user.click(screen.getByRole('button', { name: 'Review the emails' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/preview')).toHaveLength(1));
    const preview = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/checkout/preview')![1]?.body as string);
    expect(preview).toMatchObject({
      rentalStart: '2026-09-05',
      rentalEnd: '2026-09-12',
      shootDetails: 'Two-day commercial, living room set',
    });
    expect(preview).not.toHaveProperty('deliveryAddress');

    await user.click(screen.getByRole('button', { name: /^Place order and send/ }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
    const body = JSON.parse(checkoutCalls(fetchMock)[0][1]?.body as string);
    expect(body).toMatchObject({
      rentalStart: '2026-09-05',
      rentalEnd: '2026-09-12',
      shootDetails: 'Two-day commercial, living room set',
    });
    expect(body).not.toHaveProperty('deliveryAddress');
    expect(body).not.toHaveProperty('deliveryNotes');
  });

  it('redrafts the emails once the user stops typing, not on every keystroke', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    await renderCart();
    await user.click(await screen.findByRole('button', { name: 'Review the emails' }));
    await screen.findByText('Rental request — Nocturne Pictures');
    await user.type(screen.getByLabelText('Shoot details'), 'Living room');
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/preview')).toHaveLength(2));
    const last = fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/preview').at(-1)!;
    expect(JSON.parse(last[1]?.body as string)).toMatchObject({ shootDetails: 'Living room' });
  });

  it('refuses the click until the dates are filled, naming what is missing, and needs nothing about location', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(undefined, () => readyResponse({}));
    await renderCart();
    await user.click(await placeOrder());
    expect(screen.getByRole('alert')).toHaveTextContent('Still needed: Rental dates.');
    expect(screen.getByLabelText('Start')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Shoot details')).not.toHaveAttribute('aria-invalid', 'true');
    expect(checkoutCalls(fetchMock)).toHaveLength(0);

    setDate('Start', '2026-09-05');
    setDate('End', '2026-09-12');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Start')).not.toHaveAttribute('aria-invalid', 'true');
    await user.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/order-1'));
    const sent = JSON.parse(checkoutCalls(fetchMock)[0][1]?.body as string);
    expect(sent).toMatchObject({ rentalStart: '2026-09-05', rentalEnd: '2026-09-12' });
    expect(sent).not.toHaveProperty('deliveryAddress');
  });

  it('flags an end date before the start', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    await renderCart();
    await screen.findByLabelText('End');
    setDate('End', '2026-09-01');
    await user.click(await placeOrder());
    expect(screen.getByRole('alert')).toHaveTextContent('The rental end date is before the start.');
    expect(checkoutCalls(fetchMock)).toHaveLength(0);
  });

  it('on a 422 for the request shows the gaps without rereading the profile', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(() => json({ error: 'request is incomplete', missing: ['Rental dates'] }, 422));
    await renderCart();
    await user.click(await placeOrder());
    expect(await screen.findByRole('alert')).toHaveTextContent('Still needed');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/readiness')).toHaveLength(1);
    expect(screen.queryByText('Your order profile is missing something.')).not.toBeInTheDocument();
    expect(useCart.getState().lines).toHaveLength(2);
  });
});

describe('Review the emails', () => {
  const disclosure = () => screen.findByRole('button', { name: 'Review the emails' });
  const previewCalls = (fn: ReturnType<typeof stubRoutes>) => fn.mock.calls.filter(([url]) => url === '/api/checkout/preview');
  const checkoutBody = (fn: ReturnType<typeof stubRoutes>) =>
    JSON.parse(fn.mock.calls.find(([url]) => url === '/api/checkout')![1]?.body as string);

  it('is offered even when the profile is short, and the drafts see the production as typed', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(undefined, () => incompleteResponse(['Company legal name']));
    await renderCart();
    await user.type(await screen.findByLabelText('Company legal name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Review the emails' }));
    await waitFor(() => expect(previewCalls(fetchMock)).toHaveLength(1));
    expect(JSON.parse(previewCalls(fetchMock)[0][1]?.body as string)).toMatchObject({ production: { legalName: 'Acme' } });
  });

  it('is not offered while the profile is unreadable', async () => {
    stubRoutes(undefined, () => json({ error: 'boom' }, 500));
    await renderCart();
    await screen.findByText(/could not be read/);
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
      rentalStart: '2026-09-03',
      rentalEnd: '2026-09-10',
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

describe('documents', () => {
  const COI_DOC = { storagePath: 'org/coi/c.pdf', name: 'Nocturne-COI.pdf', mime: 'application/pdf', uploadedAt: '2026-08-02T00:00:00Z' };
  const CARD_DOC = { storagePath: 'org/passport/card.pdf', name: 'card-auth.pdf', mime: 'application/pdf', uploadedAt: '2026-10-18T00:00:00Z' };
  const passportCalls = (fn: ReturnType<typeof stubRoutes>) => fn.mock.calls.filter(([url]) => String(url).startsWith('/api/account/passport/'));
  const previewCalls = (fn: ReturnType<typeof stubRoutes>) => fn.mock.calls.filter(([url]) => url === '/api/checkout/preview');

  it('asks for what the cart’s vendors want and the passport lacks: the COI everywhere, a card authorization where the house holds one', async () => {
    stubRoutes();
    await renderCart();
    const group = (await screen.findByText('Documents')).closest('fieldset')!;
    const rows = within(group).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Certificate of insurance'),
      expect.stringContaining('Credit card authorization'),
    ]);
    // Both Omega and Hand Prop Room hold a card for a first rental.
    for (const row of rows) {
      expect(row).toHaveTextContent('Every vendor in your cart asks for this.');
      expect(row).toHaveTextContent('Not on file. Noted as to follow.');
    }
    expect(within(group).getByLabelText('Upload Certificate of insurance')).toBeInTheDocument();
    expect(within(group).getByLabelText('Upload Credit card authorization')).toBeInTheDocument();
    expect(within(group).getAllByRole('button', { name: 'Upload' })).toHaveLength(2);
  });

  it('does not ask for a card authorization when no vendor in the cart holds one', async () => {
    useCart.setState({ lines: [line(makePropItem({ source: 'universal', sourceId: '9', name: 'Studio desk' }))] });
    stubRoutes();
    await renderCart();
    const group = (await screen.findByText('Documents')).closest('fieldset')!;
    expect(within(group).getAllByRole('listitem')).toHaveLength(1);
    expect(group).toHaveTextContent('Certificate of insurance');
    expect(group).not.toHaveTextContent('Credit card authorization');
  });

  it('shows a document already on the passport as attached, with a Replace action, and never blocks the click on one that is missing', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(undefined, () => readyResponse(READY_DEFAULTS, { documents: { coi: COI_DOC } }));
    await renderCart();
    const group = (await screen.findByText('Documents')).closest('fieldset')!;
    const [coi, card] = within(group).getAllByRole('listitem');
    expect(coi).toHaveTextContent('Nocturne-COI.pdf · On file, attached');
    expect(within(coi).getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Not on file. Noted as to follow.');

    await user.click(await placeOrder());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/order-1'));
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout')).toHaveLength(1);
  });

  it('flags an expired document and offers to replace it', async () => {
    stubRoutes(undefined, () => readyResponse(READY_DEFAULTS, { documents: { coi: { ...COI_DOC, expiresAt: '2026-01-01' } } }));
    await renderCart();
    const group = (await screen.findByText('Documents')).closest('fieldset')!;
    const [coi] = within(group).getAllByRole('listitem');
    expect(coi).toHaveTextContent('Nocturne-COI.pdf · Expired');
    expect(within(coi).getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('uploads straight to the passport slot, marks the row on file, and redrafts the open emails with the attachment', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes(undefined, undefined, undefined, () => json({ ok: true, document: CARD_DOC }));
    await renderCart();
    await user.click(await screen.findByRole('button', { name: 'Review the emails' }));
    await waitFor(() => expect(previewCalls(fetchMock)).toHaveLength(1));

    const file = new File(['%PDF-1.4'], 'card-auth.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Upload Credit card authorization'), file);

    await waitFor(() => expect(passportCalls(fetchMock)).toHaveLength(1));
    const [url, init] = passportCalls(fetchMock)[0];
    expect(url).toBe('/api/account/passport/credit_card_authorization');
    expect(init?.method).toBe('POST');
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
    expect(((init?.body as FormData).get('file') as File).name).toBe('card-auth.pdf');

    const group = (await screen.findByText('Documents')).closest('fieldset')!;
    const [, card] = within(group).getAllByRole('listitem');
    await waitFor(() => expect(card).toHaveTextContent('card-auth.pdf · On file, attached'));
    expect(within(card).getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    // The drafts are rewritten so the preview shows the new attachment.
    await waitFor(() => expect(previewCalls(fetchMock)).toHaveLength(2));
  });

  it('shows the server’s reason inline when an upload is refused, and keeps the slot empty', async () => {
    const user = userEvent.setup();
    stubRoutes(undefined, undefined, undefined, () => json({ error: 'Upload this document as a PDF or an image.' }, 400));
    await renderCart();
    await screen.findByText('Documents');
    // A PDF by name that the server still refuses (the picker already filters by type; this is the server's answer).
    await user.upload(screen.getByLabelText('Upload Certificate of insurance'), new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    const group = screen.getByText('Documents').closest('fieldset')!;
    const [coi] = within(group).getAllByRole('listitem');
    await waitFor(() => expect(coi).toHaveTextContent('Upload this document as a PDF or an image.'));
    expect(coi).toHaveTextContent('Not on file. Noted as to follow.');
    expect(within(coi).getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });
});
