import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { ArchiveButton } from './archive-button';

// Archive / Restore toggle on a project row. Lives inside a link row, so the
// click must not bubble into navigation.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderButton(isArchived = false, onRowClick = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <div onClick={onRowClick}>
        <ArchiveButton projectId="p1" isArchived={isArchived} />
      </div>
    </QueryClientProvider>,
  );
}

beforeEach(() => resetNavigation());
afterEach(() => vi.unstubAllGlobals());

describe('ArchiveButton', () => {
  it('archives an active project and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderButton(false);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/archive');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ archived: true });
  });

  it('restores an archived project', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderButton(true);
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ archived: false });
  });

  it('does not let the click reach the row', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ ok: true }));
    const onRowClick = vi.fn();
    renderButton(false, onRowClick);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('disables itself while the request is open', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderButton(false);
    const button = screen.getByRole('button', { name: 'Archive' });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    resolve(json({ ok: true }));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('re-enables without refreshing when the request fails', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'nope' }, 500));
    renderButton(false);
    const button = screen.getByRole('button', { name: 'Archive' });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
