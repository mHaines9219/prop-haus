import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { FolderActions } from './folder-actions';

// Per-folder rename and delete. Delete is only offered on scene folders and
// always asks first, naming the items it takes with it.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderActions(over: Partial<{ kind: 'scene' | 'paperwork'; itemCount: number; name: string }> = {}) {
  return render(
    <FolderActions
      projectId="p1"
      folderId="f1"
      name={over.name ?? 'Scene 1'}
      kind={over.kind ?? 'scene'}
      itemCount={over.itemCount ?? 0}
    />,
  );
}

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rename', () => {
  it('opens an editor seeded with the current name', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Folder name' });
    expect(box).toHaveValue('Scene 1');
    expect(box).toHaveAttribute('maxlength', '120');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('PATCHes the trimmed name and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(box);
    await user.type(box, '  Diner  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/folders/f1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Diner' });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), ' B{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ name: 'Scene 1 B' });
  });

  it.each([
    ['unchanged', 'Scene 1'],
    ['blank', '   '],
  ])('cancels without a request when the name is %s', async (_label, value) => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Folder name' });
    await user.clear(box);
    await user.type(box, value);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('cancels on Escape and restores the name next time', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), 'zzz{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue('Scene 1');
  });

  it('cancels from the button', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('locks the editor while saving', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    resolve(json({ ok: true }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
  });

  it('stays in the editor without refreshing when the server refuses', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'name taken' }, 409));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByRole('textbox', { name: 'Folder name' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue('Scene 1x');
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('is not offered for the paperwork folder', () => {
    renderActions({ kind: 'paperwork', name: 'Paperwork' });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it.each([
    [0, 'Delete “Scene 1”?'],
    [1, 'Delete “Scene 1” and the 1 item saved in it?'],
    [3, 'Delete “Scene 1” and the 3 items saved in it?'],
  ])('asks with the item count (%i)', async (itemCount, message) => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderActions({ itemCount });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledWith(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('DELETEs and refreshes once confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = stubFetch(() => json({ ok: true }));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/folders/f1');
    expect(init?.method).toBe('DELETE');
  });

  it('disables both controls while deleting', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderActions();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    resolve(json({ ok: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());
  });
});
