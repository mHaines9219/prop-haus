import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { UploadForm } from './upload-form';

// Paperwork upload: the client runs the same file check as the server, so
// refusals are instant, and each accepted file goes up in its own request.

const DOCS_URL = '/api/projects/p1/folders/f1/documents';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const pdf = (name = 'coi.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

function oversized(name = 'big.pdf') {
  const file = pdf(name);
  Object.defineProperty(file, 'size', { value: MAX_PAPERWORK_BYTES + 1 });
  return file;
}

const picker = () => screen.getByLabelText('Choose files') as HTMLInputElement;

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderForm() {
  return render(<UploadForm projectId="p1" folderId="f1" />);
}

describe('UploadForm', () => {
  it('describes what it accepts', () => {
    renderForm();
    expect(screen.getByText('Drop paperwork here')).toBeInTheDocument();
    expect(screen.getByText(/PDF, image, or Office file up to 20 MB each/)).toBeInTheDocument();
    expect(picker()).toHaveAttribute('type', 'file');
    expect(picker()).toHaveAttribute('multiple');
    expect(picker()).toBeEnabled();
  });

  it('POSTs an accepted file as multipart and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }, 201));
    renderForm();
    await user.upload(picker(), pdf());

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DOCS_URL);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    const sent = (init?.body as FormData).get('file') as File;
    expect(sent.name).toBe('coi.pdf');
    expect(sent.type).toBe('application/pdf');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(picker().value).toBe('');
  });

  it('shows which file is uploading and locks the picker', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderForm();
    await user.upload(picker(), pdf());
    expect(await screen.findByText('Uploading coi.pdf…')).toBeInTheDocument();
    expect(picker()).toBeDisabled();
    resolve(json({ ok: true }, 201));
    expect(await screen.findByText('Drop paperwork here')).toBeInTheDocument();
    expect(picker()).toBeEnabled();
  });

  it('refuses an oversized file without a request', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderForm();
    await user.upload(picker(), oversized());
    expect(await screen.findByText('big.pdf is too large (max 20 MB).')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('refuses an unsupported type', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderForm();
    await user.upload(picker(), new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }));
    expect(
      await screen.findByText('setup.exe isn’t a supported type. Upload a PDF, image, or Office document.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty file', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderForm();
    await user.upload(picker(), new File([], 'empty.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('empty.pdf is empty.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('infers the type from the extension when the browser sends none', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }, 201));
    renderForm();
    await user.upload(picker(), new File(['x'], 'callsheet.docx', { type: '' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(nav.router.refresh).toHaveBeenCalled();
  });

  it('uploads each file separately and keeps going past a bad one', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }, 201));
    renderForm();
    await user.upload(picker(), [pdf('w9.pdf'), oversized(), pdf('coi.pdf')]);

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const names = fetchMock.mock.calls.map(([, init]) => ((init?.body as FormData).get('file') as File).name);
    expect(names).toEqual(['w9.pdf', 'coi.pdf']);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['big.pdf is too large (max 20 MB).']);
  });

  it('reports a server refusal with the file name and does not refresh', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'Storage down' }, 500));
    renderForm();
    await user.upload(picker(), pdf());
    expect(await screen.findByText('coi.pdf: Storage down')).toBeInTheDocument();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('reports a network failure', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    renderForm();
    await user.upload(picker(), pdf());
    expect(await screen.findByText('coi.pdf: offline')).toBeInTheDocument();
  });

  it('still refreshes when one of several uploads fails', async () => {
    const user = userEvent.setup();
    let n = 0;
    stubFetch(() => (n++ === 0 ? json({ error: 'Storage down' }, 500) : json({ ok: true }, 201)));
    renderForm();
    await user.upload(picker(), [pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText('a.pdf: Storage down')).toBeInTheDocument();
  });

  it('hands a signed-out user to login and stops', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = stubFetch(() => json({ error: 'not signed in' }, 401));
    renderForm();
    await user.upload(picker(), [pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('accepts dropped files', async () => {
    const fetchMock = stubFetch(() => json({ ok: true }, 201));
    renderForm();
    const zone = screen.getByText('Drop paperwork here').closest('div.border-dashed')!;
    fireEvent.dragOver(zone);
    expect(zone).toHaveClass('border-emerald-500');
    fireEvent.drop(zone, { dataTransfer: { files: [pdf('dropped.pdf')] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(((fetchMock.mock.calls[0][1]?.body as FormData).get('file') as File).name).toBe('dropped.pdf');
    expect(zone).not.toHaveClass('border-emerald-500');
  });

  it('ignores an empty selection', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderForm();
    await user.upload(picker(), []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
