import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORIZATION_SENTENCE,
  EMPTY_ORDER_PROFILE,
  normalizeOrderProfile,
  orderReadiness,
  type OrderProfile,
  type OrderReadiness,
} from '@/lib/order-profile';
import { READY_PROFILE } from '@/test/fixtures/orders';
import { OrderProfileForm } from './order-profile-form';

// The order profile is what makes checkout one click. These tests pin the
// form's contract with /api/account/profile and the COI upload route, and the
// copy that carries legal weight (the authorization sentence).

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function saveOk(profile: OrderProfile): Response {
  return json({ ok: true, profile, readiness: orderReadiness(profile) });
}

const NOT_READY: OrderReadiness = orderReadiness(EMPTY_ORDER_PROFILE);

function renderForm(profile: OrderProfile = EMPTY_ORDER_PROFILE, readiness = orderReadiness(profile)) {
  return render(<OrderProfileForm initialProfile={profile} initialReadiness={readiness} />);
}

/** The Row wrapper for a labelled field group. */
function row(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'span' }).parentElement!.parentElement!;
}

function rowInput(label: string): HTMLInputElement {
  return row(label).querySelector('input')!;
}

function saveButton() {
  return screen.getByRole('button', { name: /save profile|saving/i });
}

function lastProfileBody(fn: ReturnType<typeof stubFetch>): unknown {
  const call = [...fn.mock.calls].reverse().find(([url]) => String(url) === '/api/account/profile');
  return JSON.parse(call![1]!.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initial render', () => {
  it('shows every section with empty fields for an empty profile', () => {
    renderForm();
    for (const h of ['Company', 'Contacts', 'Delivery defaults', 'Insurance on file', 'Authorization']) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText('As it appears on your contracts')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByText('No certificate on file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload PDF' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: AUTHORIZATION_SENTENCE })).not.toBeChecked();
    expect(screen.queryByText(/^Accepted/)).not.toBeInTheDocument();
  });

  it('lists the entity types with their labels', () => {
    renderForm();
    const options = within(screen.getByRole('combobox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['—', 'LLC', 'Corporation', 'Sole proprietor', 'Other']);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'llc', 'corp', 'sole_prop', 'other']);
  });

  it('hydrates every field from a full profile', () => {
    const profile: OrderProfile = {
      company: {
        legalName: 'Nocturne Pictures LLC',
        dba: 'Nocturne',
        entityType: 'corp',
        address: { line1: '1 Main St', line2: 'Stage 4', city: 'Burbank', state: 'CA', zip: '91505' },
        billingAddress: { line1: '2 Bill Rd', city: 'LA', state: 'CA', zip: '90001' },
        phone: '818-555-0100',
        website: 'https://nocturne.example',
      },
      contacts: {
        ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example', phone: '818-555-0101' },
        accountsPayable: { name: 'Pat AP', email: 'ap@nocturne.example' },
      },
      defaults: {
        rentalWindowDays: 10,
        deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
        deliveryNotes: 'Dock B, ask for Sam',
      },
      insurance: {
        carrier: 'Hartford',
        policyNumber: 'GL-123',
        glLimit: 1_000_000,
        aggregateLimit: 2_000_000,
        workersCompLimit: 500_000,
        additionalInsuredAvailable: true,
        expiresAt: '2027-01-15T00:00:00Z',
        broker: { name: 'Broker Bob', email: 'bob@broker.example' },
        coiDocument: { storagePath: 'org/coi.pdf', name: 'coi-2026.pdf', uploadedAt: '2026-09-02T12:00:00Z' },
      },
      authorization: { formsOnBehalf: true, acceptedAt: '2026-09-01T12:00:00Z' },
    };
    renderForm(profile);

    expect(screen.getByPlaceholderText('As it appears on your contracts')).toHaveValue('Nocturne Pictures LLC');
    expect(screen.getByPlaceholderText('Production or trade name, if different')).toHaveValue('Nocturne');
    expect(screen.getByRole('combobox')).toHaveValue('corp');
    const address = row('Address');
    expect(within(address).getByPlaceholderText('Street')).toHaveValue('1 Main St');
    expect(within(address).getByPlaceholderText('Suite, stage, building')).toHaveValue('Stage 4');
    expect(within(address).getByPlaceholderText('City')).toHaveValue('Burbank');
    expect(within(address).getByPlaceholderText('ST')).toHaveValue('CA');
    expect(within(address).getByPlaceholderText('ZIP')).toHaveValue('91505');
    expect(within(row('Billing address')).getByPlaceholderText('Street')).toHaveValue('2 Bill Rd');
    expect(rowInput('Phone')).toHaveValue('818-555-0100');
    expect(rowInput('Website')).toHaveValue('https://nocturne.example');

    const ordering = row('Ordering contact');
    expect(within(ordering).getByPlaceholderText('Name')).toHaveValue('Sam Reyes');
    expect(within(ordering).getByPlaceholderText('Email')).toHaveValue('sam@nocturne.example');
    expect(within(ordering).getByPlaceholderText('Phone')).toHaveValue('818-555-0101');
    expect(within(row('Accounts payable')).getByPlaceholderText('Email')).toHaveValue('ap@nocturne.example');

    expect(within(row('Rental window')).getByRole('spinbutton')).toHaveValue(10);
    expect(within(row('Delivery address')).getByPlaceholderText('ZIP')).toHaveValue('91505');
    expect(screen.getByPlaceholderText('Dock, hours, who to ask for…')).toHaveValue('Dock B, ask for Sam');

    expect(rowInput('Carrier')).toHaveValue('Hartford');
    expect(rowInput('Policy number')).toHaveValue('GL-123');
    expect(within(row('GL limit (per occurrence)')).getByRole('spinbutton')).toHaveValue(1_000_000);
    expect(within(row('Aggregate limit')).getByRole('spinbutton')).toHaveValue(2_000_000);
    expect(within(row('Workers comp limit')).getByRole('spinbutton')).toHaveValue(500_000);
    expect(screen.getByRole('checkbox', { name: 'Endorsement available' })).toBeChecked();
    expect(rowInput('Policy expiry')).toHaveValue('2027-01-15');
    expect(within(row('Broker')).getByPlaceholderText('Name')).toHaveValue('Broker Bob');

    expect(screen.getByRole('link', { name: 'coi-2026.pdf' })).toHaveAttribute('href', '/api/account/insurance/coi');
    expect(screen.getByText(/uploaded Sep 2, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();

    expect(screen.getByRole('checkbox', { name: AUTHORIZATION_SENTENCE })).toBeChecked();
    expect(screen.getByText('Accepted Sep 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Ready to order')).toBeInTheDocument();
  });

  it('does not crash when optional sections are partially filled', () => {
    renderForm({
      ...EMPTY_ORDER_PROFILE,
      company: { address: { city: 'Burbank' } },
      contacts: { ordering: { email: 'x@y.z' } },
      insurance: { broker: { phone: '1' } },
    });
    expect(within(row('Address')).getByPlaceholderText('City')).toHaveValue('Burbank');
    expect(within(row('Address')).getByPlaceholderText('Street')).toHaveValue('');
    expect(within(row('Ordering contact')).getByPlaceholderText('Email')).toHaveValue('x@y.z');
    expect(within(row('Broker')).getByPlaceholderText('Phone')).toHaveValue('1');
  });

  it('shows the authorization sentence verbatim inside the checkbox label', () => {
    renderForm();
    const box = screen.getByRole('checkbox', { name: AUTHORIZATION_SENTENCE });
    expect(box.closest('label')).toHaveTextContent(AUTHORIZATION_SENTENCE);
  });

  // Every text field is identified only by a placeholder or a sibling span;
  // no <label htmlFor> or aria-label, so screen readers get nothing.
  it.fails('labels the legal name field accessibly', () => {
    renderForm();
    expect(screen.getByRole('textbox', { name: /legal name/i })).toBeInTheDocument();
  });
});

describe('readiness summary', () => {
  it('lists what is missing, pluralised', () => {
    renderForm(EMPTY_ORDER_PROFILE, NOT_READY);
    expect(
      screen.getByText(
        '5 things missing before one-click: Company legal name, Ordering contact name, Ordering contact email, Delivery address, Authorization to complete forms',
      ),
    ).toBeInTheDocument();
  });

  it('uses the singular for one missing item', () => {
    renderForm(READY_PROFILE, { ready: false, missing: ['Delivery address'] });
    expect(screen.getByText('1 thing missing before one-click: Delivery address')).toBeInTheDocument();
  });

  it('shows the ready token when nothing is missing', () => {
    renderForm(READY_PROFILE);
    expect(screen.getByText('Ready to order')).toBeInTheDocument();
  });

  it('updates from the server response after a save', async () => {
    const user = userEvent.setup();
    stubFetch(() => saveOk(READY_PROFILE));
    renderForm(EMPTY_ORDER_PROFILE, NOT_READY);
    await user.click(saveButton());
    expect(await screen.findByText('Ready to order')).toBeInTheDocument();
  });

  // The badge only changes from the PATCH response; typing a legal name leaves
  // "Company legal name" in the missing list until the user saves.
  it.fails('drops an item from the missing list as soon as the field is filled', async () => {
    const user = userEvent.setup();
    renderForm(EMPTY_ORDER_PROFILE, NOT_READY);
    await user.type(screen.getByPlaceholderText('As it appears on your contracts'), 'Nocturne Pictures LLC');
    expect(screen.getByText(/missing before one-click/)).not.toHaveTextContent('Company legal name');
  });
});

describe('editing fields', () => {
  it('selects an entity type and clears it back to none', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm();
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'sole_prop');
    expect(select).toHaveValue('sole_prop');
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((lastProfileBody(fetchMock) as OrderProfile).company.entityType).toBe('sole_prop');

    await user.selectOptions(select, '');
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((lastProfileBody(fetchMock) as OrderProfile).company).not.toHaveProperty('entityType');
  });

  it('keeps address fields independent between company, billing and delivery', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(within(row('Address')).getByPlaceholderText('Street'), '1 Main St');
    await user.type(within(row('Billing address')).getByPlaceholderText('Street'), '2 Bill Rd');
    await user.type(within(row('Delivery address')).getByPlaceholderText('Street'), '3 Dock Ln');
    expect(within(row('Address')).getByPlaceholderText('Street')).toHaveValue('1 Main St');
    expect(within(row('Billing address')).getByPlaceholderText('Street')).toHaveValue('2 Bill Rd');
    expect(within(row('Delivery address')).getByPlaceholderText('Street')).toHaveValue('3 Dock Ln');
    expect(within(row('Address')).getByPlaceholderText('City')).toHaveValue('');
  });

  it('caps the state field at two characters', async () => {
    const user = userEvent.setup();
    renderForm();
    const st = within(row('Address')).getByPlaceholderText('ST');
    expect(st).toHaveAttribute('maxlength', '2');
    await user.type(st, 'CAL');
    expect(st).toHaveValue('CA');
  });

  it('bounds the rental window at one day and stores it as a number', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm();
    const days = within(row('Rental window')).getByRole('spinbutton');
    expect(days).toHaveAttribute('type', 'number');
    expect(days).toHaveAttribute('min', '1');
    await user.type(days, '14');
    expect(days).toHaveValue(14);
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((lastProfileBody(fetchMock) as OrderProfile).defaults.rentalWindowDays).toBe(14);
  });

  it('drops the rental window when cleared', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm({ ...EMPTY_ORDER_PROFILE, defaults: { rentalWindowDays: 7 } });
    await user.clear(within(row('Rental window')).getByRole('spinbutton'));
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((lastProfileBody(fetchMock) as OrderProfile).defaults).not.toHaveProperty('rentalWindowDays');
  });

  it('stores dollar limits as numbers and drops them when cleared', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm({ ...EMPTY_ORDER_PROFILE, insurance: { aggregateLimit: 2_000_000 } });
    const gl = within(row('GL limit (per occurrence)')).getByRole('spinbutton');
    expect(gl).toHaveAttribute('min', '0');
    await user.type(gl, '1000000');
    await user.clear(within(row('Aggregate limit')).getByRole('spinbutton'));
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = lastProfileBody(fetchMock) as OrderProfile;
    expect(body.insurance.glLimit).toBe(1_000_000);
    expect(body.insurance).not.toHaveProperty('aggregateLimit');
  });

  it('toggles the additional-insured endorsement', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: 'Endorsement available' }));
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((lastProfileBody(fetchMock) as OrderProfile).insurance.additionalInsuredAvailable).toBe(true);
  });

  it('records the policy expiry from the date input', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm();
    const expiry = rowInput('Policy expiry');
    expect(expiry).toHaveAttribute('type', 'date');
    await user.type(expiry, '2027-03-31');
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((lastProfileBody(fetchMock) as OrderProfile).insurance.expiresAt).toBe('2027-03-31');
  });
});

describe('saving', () => {
  it('PATCHes the profile as JSON that is already normalized', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => saveOk(READY_PROFILE));
    renderForm();

    await user.type(screen.getByPlaceholderText('As it appears on your contracts'), 'Nocturne Pictures LLC');
    await user.selectOptions(screen.getByRole('combobox'), 'llc');
    const ordering = row('Ordering contact');
    await user.type(within(ordering).getByPlaceholderText('Name'), 'Sam Reyes');
    await user.type(within(ordering).getByPlaceholderText('Email'), 'sam@nocturne.example');
    await user.type(within(row('Rental window')).getByRole('spinbutton'), '7');
    const delivery = row('Delivery address');
    await user.type(within(delivery).getByPlaceholderText('Street'), '4100 W Alameda Ave');
    await user.type(within(delivery).getByPlaceholderText('City'), 'Burbank');
    await user.type(within(delivery).getByPlaceholderText('ST'), 'CA');
    await user.type(within(delivery).getByPlaceholderText('ZIP'), '91505');
    await user.type(rowInput('Carrier'), 'Hartford');
    await user.click(screen.getByRole('checkbox', { name: AUTHORIZATION_SENTENCE }));

    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/profile');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    const body = JSON.parse(init?.body as string);
    const expected: OrderProfile = {
      company: { legalName: 'Nocturne Pictures LLC', entityType: 'llc' },
      contacts: { ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example' } },
      defaults: {
        rentalWindowDays: 7,
        deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
      },
      insurance: { carrier: 'Hartford' },
      authorization: { formsOnBehalf: true },
    };
    expect(body).toEqual(expected);
    expect(normalizeOrderProfile(body)).toEqual(body);
  });

  it('disables the button and shows Saving… while the request is in flight', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderForm();
    await user.click(saveButton());
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    resolve(saveOk(EMPTY_ORDER_PROFILE));
    expect(await screen.findByRole('button', { name: 'Save profile' })).toBeEnabled();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('adopts the server profile and shows the accepted date after saving the authorization', async () => {
    const user = userEvent.setup();
    const accepted: OrderProfile = {
      ...READY_PROFILE,
      company: { ...READY_PROFILE.company, legalName: 'Nocturne Pictures LLC (server)' },
      authorization: { formsOnBehalf: true, acceptedAt: '2026-09-02T12:00:00Z', acceptedByUserId: 'u1' },
    };
    stubFetch(() => saveOk(accepted));
    renderForm();
    await user.click(screen.getByRole('checkbox', { name: AUTHORIZATION_SENTENCE }));
    await user.click(saveButton());
    expect(await screen.findByText('Accepted Sep 2, 2026')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('As it appears on your contracts')).toHaveValue('Nocturne Pictures LLC (server)');
    expect(screen.getByRole('checkbox', { name: AUTHORIZATION_SENTENCE })).toBeChecked();
  });

  it('hides Saved again as soon as a field changes', async () => {
    const user = userEvent.setup();
    stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
    renderForm();
    await user.click(saveButton());
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await user.type(rowInput('Phone'), '8');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it.each([
    ['a 4xx with a message', json({ error: 'legal name is required' }, 400), 'legal name is required'],
    ['a 5xx without a body', new Response('oops', { status: 502 }), 'HTTP 502'],
    ['a 200 without a profile', json({ ok: true }), 'HTTP 200'],
  ])('surfaces %s and keeps the typed input', async (_label, response, message) => {
    const user = userEvent.setup();
    stubFetch(() => response);
    renderForm();
    const legal = screen.getByPlaceholderText('As it appears on your contracts');
    await user.type(legal, 'Nocturne');
    await user.click(saveButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(legal).toHaveValue('Nocturne');
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('surfaces a network failure and keeps the typed input', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderForm();
    const legal = screen.getByPlaceholderText('As it appears on your contracts');
    await user.type(legal, 'Nocturne');
    await user.click(saveButton());
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(legal).toHaveValue('Nocturne');
  });

  it('clears the error when the user edits again', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'nope' }, 500));
    renderForm();
    await user.click(saveButton());
    expect(await screen.findByText('nope')).toBeInTheDocument();
    await user.type(rowInput('Carrier'), 'H');
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
  });
});

describe('COI upload', () => {
  const pdf = () => new File(['%PDF-1.4'], 'coi.pdf', { type: 'application/pdf' });
  const uploaded = { storagePath: 'org/coi.pdf', name: 'coi.pdf', uploadedAt: '2026-09-02T12:00:00Z' };

  function fileInput(container: HTMLElement) {
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'application/pdf,image/*');
    return input;
  }

  it('opens the file picker from the Upload button', async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    await user.click(screen.getByRole('button', { name: 'Upload PDF' }));
    expect(click).toHaveBeenCalled();
    expect(click.mock.instances[0]).toBe(fileInput(container));
  });

  it('POSTs the file as multipart and reflects the returned document', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((url) =>
      url === '/api/account/insurance/coi' ? json({ ok: true, document: uploaded }) : json({}, 404),
    );
    const { container } = renderForm();
    await user.upload(fileInput(container), pdf());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/insurance/coi');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    const sent = (init?.body as FormData).get('file') as File;
    expect(sent.name).toBe('coi.pdf');
    expect(sent.type).toBe('application/pdf');
    expect([...(init?.body as FormData).keys()]).toEqual(['file']);

    expect(await screen.findByRole('link', { name: 'coi.pdf' })).toHaveAttribute('href', '/api/account/insurance/coi');
    expect(screen.getByText(/uploaded Sep 2, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.queryByText('No certificate on file')).not.toBeInTheDocument();
  });

  it('includes the uploaded document in the next profile save', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((url) =>
      url === '/api/account/insurance/coi' ? json({ ok: true, document: uploaded }) : saveOk(EMPTY_ORDER_PROFILE),
    );
    const { container } = renderForm();
    await user.upload(fileInput(container), pdf());
    await screen.findByRole('link', { name: 'coi.pdf' });
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((lastProfileBody(fetchMock) as OrderProfile).insurance.coiDocument).toEqual(uploaded);
  });

  it('replaces an existing certificate', async () => {
    const user = userEvent.setup();
    const replacement = { storagePath: 'org/coi-2.pdf', name: 'coi-2027.pdf', uploadedAt: '2026-10-01T12:00:00Z' };
    stubFetch(() => json({ ok: true, document: replacement }));
    const { container } = renderForm({ ...EMPTY_ORDER_PROFILE, insurance: { coiDocument: uploaded } });
    expect(screen.getByRole('link', { name: 'coi.pdf' })).toBeInTheDocument();
    await user.upload(fileInput(container), new File(['%PDF'], 'coi-2027.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('link', { name: 'coi-2027.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'coi.pdf' })).not.toBeInTheDocument();
    expect(screen.getByText(/uploaded Oct 1, 2026/)).toBeInTheDocument();
  });

  it('disables the button while uploading', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    const { container } = renderForm();
    await user.upload(fileInput(container), pdf());
    expect(await screen.findByRole('button', { name: 'Uploading…' })).toBeDisabled();
    resolve(json({ ok: true, document: uploaded }));
    expect(await screen.findByRole('button', { name: 'Replace' })).toBeEnabled();
  });

  it.each([
    ['too large', json({ error: 'file is too large' }, 413), 'file is too large'],
    ['signed out', json({ error: 'not signed in' }, 401), 'not signed in'],
    ['no body', new Response(null, { status: 500 }), 'HTTP 500'],
  ])('shows the upload error when the server says %s', async (_label, response, message) => {
    const user = userEvent.setup();
    stubFetch(() => response);
    const { container } = renderForm();
    await user.upload(fileInput(container), pdf());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('No certificate on file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload PDF' })).toBeEnabled();
  });

  it('shows the upload error when the network fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const { container } = renderForm();
    await user.upload(fileInput(container), pdf());
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  it('does nothing when the picker is cancelled', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({}));
    const { container } = renderForm();
    await user.upload(fileInput(container), []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('No certificate on file')).toBeInTheDocument();
  });
});

describe('an unsaved edit', () => {
  beforeEach(() => {
    stubFetch(() => saveOk(EMPTY_ORDER_PROFILE));
  });

  it('does not fire a request until the form is submitted', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(rowInput('Phone'), '818');
    expect(fetch).not.toHaveBeenCalled();
  });
});
