import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PASSPORT_KINDS,
  PASSPORT_KIND_SPECS,
  passportSummary,
  type Passport,
  type PassportDocument,
  type PassportKind,
} from '@/lib/passport';
import { PassportWallet } from './passport-wallet';

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function doc(over: Partial<PassportDocument> = {}): PassportDocument {
  return {
    storagePath: 'org/passport/x.pdf',
    name: 'x.pdf',
    mime: 'application/pdf',
    uploadedAt: '2026-09-01T12:00:00Z',
    ...over,
  };
}

function renderWallet(passport: Passport = { documents: {} }) {
  return render(<PassportWallet initialPassport={passport} initialSummary={passportSummary(passport)} />);
}

function row(kind: PassportKind): HTMLElement {
  return screen.getByText(PASSPORT_KIND_SPECS[kind].label, { selector: 'p' }).parentElement!.parentElement!;
}

function fileInput(kind: PassportKind): HTMLInputElement {
  return row(kind).querySelector('input[type="file"]')!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('empty passport', () => {
  it('lists every slot with nothing on file and an upload action', () => {
    renderWallet();
    for (const kind of PASSPORT_KINDS) {
      const r = within(row(kind));
      expect(r.getByText('Nothing on file')).toBeInTheDocument();
      expect(r.getByRole('button', { name: 'Upload' })).toBeEnabled();
      expect(r.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    }
    expect(screen.getByText(`0 of ${PASSPORT_KINDS.length} on file`)).toBeInTheDocument();
  });

  it('limits certificate and ID slots to PDFs and images', () => {
    renderWallet();
    expect(fileInput('drivers_license')).toHaveAttribute('accept', 'application/pdf,image/*');
    expect(fileInput('w9')).not.toHaveAttribute('accept');
  });

  it('never presents Prop Haus as the insurer or broker', () => {
    renderWallet();
    const text = document.body.textContent ?? '';
    expect(within(row('coi')).getByText(/Issued by your broker/)).toBeInTheDocument();
    expect(text).not.toMatch(/Prop Haus (is|as) (an? |your )?(insurer|broker|agent)/i);
    expect(text).not.toMatch(/(issued|bound|brokered) by Prop Haus/i);
  });
});

describe('populated passport', () => {
  it('links each document to its download route and offers replace and remove', () => {
    renderWallet({ documents: { w9: doc({ name: 'w9-2026.pdf' }) } });
    const r = within(row('w9'));
    expect(r.getByRole('link', { name: 'w9-2026.pdf' })).toHaveAttribute('href', '/api/account/passport/w9');
    expect(r.getByText(/uploaded Sep 1, 2026/)).toBeInTheDocument();
    expect(r.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(r.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByText(`1 of ${PASSPORT_KINDS.length} on file`)).toBeInTheDocument();
  });

  it('prints an unparseable upload date as stored rather than "Invalid Date"', () => {
    renderWallet({ documents: { w9: doc({ uploadedAt: 'last spring' }) } });
    expect(within(row('w9')).getByText(/uploaded last spring/)).toBeInTheDocument();
  });

  it('shows expiry and reference fields only for slots that track them', () => {
    renderWallet({
      documents: {
        drivers_license: doc({ expiresAt: '2030-02-03T00:00:00Z', reference: 'D123' }),
        w9: doc(),
      },
    });
    const license = within(row('drivers_license'));
    expect(license.getByLabelText('Expires')).toHaveValue('2030-02-03');
    expect(license.getByLabelText('License number')).toHaveValue('D123');
    expect(within(row('w9')).queryByLabelText('Expires')).not.toBeInTheDocument();
    expect(within(row('credit_card_authorization')).queryByLabelText('Expires')).not.toBeInTheDocument();
  });

  it('flags an expired document on its row and in the summary', () => {
    renderWallet({ documents: { coi: doc({ expiresAt: '2020-01-01' }), w9: doc() } });
    expect(within(row('coi')).getByText('Expired')).toBeInTheDocument();
    expect(within(row('w9')).queryByText('Expired')).not.toBeInTheDocument();
    expect(screen.getByText('1 expired')).toBeInTheDocument();
  });

  it('reads Complete when every slot is on file and current', () => {
    const documents = Object.fromEntries(PASSPORT_KINDS.map((k) => [k, doc()]));
    renderWallet({ documents });
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });
});

describe('upload', () => {
  it('opens the file picker from the upload button', async () => {
    renderWallet();
    const picker = vi.fn();
    fileInput('w9').addEventListener('click', picker);
    await userEvent.click(within(row('w9')).getByRole('button', { name: 'Upload' }));
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('posts the file to the slot route and shows the stored document', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = stubFetch(async () => {
      await gate;
      return json({ document: doc({ name: 'license.png', expiresAt: '2031-05-06', reference: 'D9' }) });
    });
    renderWallet();
    const file = new File(['x'], 'license.png', { type: 'image/png' });
    await userEvent.upload(fileInput('drivers_license'), file);

    expect(within(row('drivers_license')).getByRole('button', { name: 'Working…' })).toBeDisabled();
    release();

    const r = within(row('drivers_license'));
    expect(await r.findByRole('link', { name: 'license.png' })).toBeInTheDocument();
    expect(r.getByLabelText('Expires')).toHaveValue('2031-05-06');
    expect(r.getByLabelText('License number')).toHaveValue('D9');
    expect(screen.getByText(`1 of ${PASSPORT_KINDS.length} on file`)).toBeInTheDocument();

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/account/passport/drivers_license');
    expect(init?.method).toBe('POST');
    expect((init?.body as FormData).get('file')).toMatchObject({ name: 'license.png' });
  });

  it('shows the route error and keeps the slot empty', async () => {
    stubFetch(() => json({ error: 'Upload this document as a PDF or an image.' }, 400));
    renderWallet();
    await userEvent.upload(fileInput('drivers_license'), new File(['x'], 'id.pdf', { type: 'application/pdf' }));
    const r = within(row('drivers_license'));
    expect(await r.findByText('Upload this document as a PDF or an image.')).toBeInTheDocument();
    expect(r.getByText('Nothing on file')).toBeInTheDocument();
    expect(r.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('falls back to a generic message when the failure is not an Error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')));
    renderWallet();
    await userEvent.upload(fileInput('w9'), new File(['x'], 'w9.pdf', { type: 'application/pdf' }));
    expect(await within(row('w9')).findByText('Something went wrong.')).toBeInTheDocument();
  });
});

describe('remove', () => {
  it('deletes the slot and empties the row and its fields', async () => {
    const fetch = stubFetch(() => json({ ok: true }));
    renderWallet({ documents: { business_license: doc({ name: 'bl.pdf', reference: 'BL-1' }) } });
    await userEvent.click(within(row('business_license')).getByRole('button', { name: 'Remove' }));

    const r = within(row('business_license'));
    expect(await r.findByText('Nothing on file')).toBeInTheDocument();
    expect(r.queryByLabelText('License number')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/account/passport/business_license', { method: 'DELETE' });
    expect(screen.getByText(`0 of ${PASSPORT_KINDS.length} on file`)).toBeInTheDocument();
  });

  it('keeps the document when the delete fails', async () => {
    stubFetch(() => json({ error: 'not signed in' }, 401));
    renderWallet({ documents: { w9: doc({ name: 'w9.pdf' }) } });
    await userEvent.click(within(row('w9')).getByRole('button', { name: 'Remove' }));
    const r = within(row('w9'));
    expect(await r.findByText('not signed in')).toBeInTheDocument();
    expect(r.getByRole('link', { name: 'w9.pdf' })).toBeInTheDocument();
  });
});

describe('expiry and reference', () => {
  it('patches changed fields on blur and sends blanks as absent', async () => {
    const fetch = stubFetch((_url, init) => {
      const body = JSON.parse(init!.body as string) as Partial<PassportDocument>;
      return json({ document: doc({ name: 'bl.pdf', ...body }) });
    });
    renderWallet({ documents: { business_license: doc({ name: 'bl.pdf', reference: 'BL-1' }) } });
    const ref = within(row('business_license')).getByLabelText('License number');
    await userEvent.clear(ref);
    await userEvent.tab();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/account/passport/business_license');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init!.body as string)).toEqual({});
  });

  it('sends a new expiry date and marks the row expired when it has passed', async () => {
    const fetch = stubFetch((_url, init) => {
      const body = JSON.parse(init!.body as string) as Partial<PassportDocument>;
      return json({ document: doc({ name: 'r.pdf', ...body }) });
    });
    renderWallet({ documents: { resale_certificate: doc({ name: 'r.pdf' }) } });
    const expires = within(row('resale_certificate')).getByLabelText('Expires');
    await userEvent.type(expires, '2021-04-05');
    await userEvent.tab();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ expiresAt: '2021-04-05' });
    expect(await within(row('resale_certificate')).findByText('Expired')).toBeInTheDocument();
  });

  it('does not patch when nothing changed', async () => {
    const fetch = stubFetch(() => json({}));
    renderWallet({ documents: { drivers_license: doc({ expiresAt: '2030-01-01', reference: 'D1' }) } });
    await userEvent.click(within(row('drivers_license')).getByLabelText('License number'));
    await userEvent.tab();
    expect(fetch).not.toHaveBeenCalled();
  });
});
