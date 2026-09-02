import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { NewFolderForm } from './new-folder-form';

// "Add a scene" row: a blank name falls back to the suggested one, success
// collapses the row and refreshes the server-rendered list.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const STRIP = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants']);
  type Plain = React.ComponentType<Record<string, unknown>>;
  const cache = new Map<string, Plain>();
  const motion = new Proxy({} as Record<string, Plain>, {
    get(_t, tag: string) {
      let C = cache.get(tag);
      if (!C) {
        C = React.forwardRef<HTMLElement, Record<string, unknown>>(function Plain(props, ref) {
          const clean = Object.fromEntries(Object.entries(props).filter(([k]) => !STRIP.has(k)));
          return React.createElement(tag, { ...clean, ref });
        }) as unknown as Plain;
        cache.set(tag, C);
      }
      return C;
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const toggle = () => screen.getByRole('button', { name: /Add a scene|Cancel/ });
const nameBox = () => screen.getByPlaceholderText(/^Scene 3 — e\.g\./);

beforeEach(() => resetNavigation());
afterEach(() => vi.unstubAllGlobals());

function renderForm() {
  return render(<NewFolderForm projectId="p1" suggestedName="Scene 3" />);
}

describe('NewFolderForm', () => {
  it('starts collapsed and opens on the row', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(toggle());
    expect(toggle()).toHaveTextContent('Cancel');
    expect(nameBox()).toHaveAttribute('maxlength', '120');
    expect(screen.getByRole('button', { name: 'Add scene' })).toBeEnabled();
  });

  it('posts the trimmed name, collapses and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ id: 'f2' }, 201));
    renderForm();
    await user.click(toggle());
    await user.type(nameBox(), '  Sc. 12 diner  ');
    await user.click(screen.getByRole('button', { name: 'Add scene' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects/p1/folders');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Sc. 12 diner' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(toggle()).toHaveTextContent('Add a scene');
  });

  it('falls back to the suggested name when left blank', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ id: 'f2' }, 201));
    renderForm();
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Add scene' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ name: 'Scene 3' });
  });

  it('clears the typed name after a successful add', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ id: 'f2' }, 201));
    renderForm();
    await user.click(toggle());
    await user.type(nameBox(), 'Diner');
    await user.click(screen.getByRole('button', { name: 'Add scene' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    await user.click(toggle());
    expect(nameBox()).toHaveValue('');
  });

  it('locks the form while adding', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderForm();
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Add scene' }));
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(nameBox()).toBeDisabled();
    resolve(json({ id: 'f2' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
  });

  it('shows an error, stays open and keeps the name on failure', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'nope' }, 500));
    renderForm();
    await user.click(toggle());
    await user.type(nameBox(), 'Diner');
    await user.click(screen.getByRole('button', { name: 'Add scene' }));
    expect(await screen.findByText('Couldn’t add that scene. Try again.')).toBeInTheDocument();
    expect(nameBox()).toHaveValue('Diner');
    expect(screen.getByRole('button', { name: 'Add scene' })).toBeEnabled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('shows the error on a network failure', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    renderForm();
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Add scene' }));
    expect(await screen.findByText('Couldn’t add that scene. Try again.')).toBeInTheDocument();
  });

  it('drops the error when cancelled', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'nope' }, 500));
    renderForm();
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Add scene' }));
    await screen.findByText('Couldn’t add that scene. Try again.');
    await user.click(toggle());
    await user.click(toggle());
    expect(screen.queryByText('Couldn’t add that scene. Try again.')).not.toBeInTheDocument();
  });
});
