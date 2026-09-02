import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { RemoveItemButton } from './remove-item-button';

// Remove a saved item from a scene folder: one DELETE, then a server refresh.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderButton(itemId = 'omega-12345') {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RemoveItemButton projectId="p1" folderId="f1" itemId={itemId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => resetNavigation());
afterEach(() => vi.unstubAllGlobals());

describe('RemoveItemButton', () => {
  it('DELETEs the item by id and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderButton();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/folders/f1/items?itemId=omega-12345');
    expect(init?.method).toBe('DELETE');
  });

  it('encodes the item id', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderButton('clip-a/b c');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/folders/f1/items?itemId=clip-a%2Fb%20c');
  });

  it('disables itself while the request is open', async () => {
    const user = userEvent.setup();
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
    stubFetch(() => json({ error: 'nope' }, 500));
    renderButton();
    const button = screen.getByRole('button', { name: 'Remove' });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
