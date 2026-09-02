import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { RemoveDocumentButton } from './remove-document-button';

// Remove a paperwork file. Deleting bytes is irreversible, so it asks first.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderButton(documentId = 'doc-1', name = 'COI 2026.pdf') {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RemoveDocumentButton projectId="p1" folderId="f1" documentId={documentId} name={name} />
    </QueryClientProvider>,
  );
}

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RemoveDocumentButton', () => {
  it('asks by name and does nothing when declined', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(confirm).toHaveBeenCalledWith('Remove “COI 2026.pdf” from paperwork? This deletes the file.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('DELETEs the document and refreshes once confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderButton('doc a/1');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/folders/f1/documents?documentId=doc%20a%2F1');
    expect(init?.method).toBe('DELETE');
  });

  it('disables itself while the request is open', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderButton();
    const button = screen.getByRole('button', { name: 'Remove' });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    resolve(json({ ok: true }));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('re-enables without refreshing when the request fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubFetch(() => json({ error: 'nope' }, 500));
    renderButton();
    const button = screen.getByRole('button', { name: 'Remove' });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
