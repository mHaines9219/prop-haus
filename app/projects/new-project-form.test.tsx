import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { NewProjectForm } from './new-project-form';

// "Start a new project" row: opens inline, posts the trimmed name, lands on
// the new project.

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

const PLACEHOLDER = 'Production name (e.g. Nocturne S2, Ep. 4)';
const toggle = () => screen.getByRole('button', { name: /Start a new project|Cancel/ });

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NewProjectForm', () => {
  it('starts collapsed', () => {
    render(<NewProjectForm />);
    expect(toggle()).toHaveTextContent('Start a new project');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument();
  });

  it('opens into a name field with a disabled submit', async () => {
    const user = userEvent.setup();
    render(<NewProjectForm />);
    await user.click(toggle());
    expect(toggle()).toHaveTextContent('Cancel');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveAttribute('maxlength', '200');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
  });

  it('posts the trimmed name and lands on the project', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ id: 'p1' }, 201));
    render(<NewProjectForm />);
    await user.click(toggle());
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), '  Nocturne S2  ');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/projects/p1'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Nocturne S2' });
  });

  it('keeps the button disabled for whitespace and refuses a forced blank submit', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ id: 'p1' }));
    render(<NewProjectForm />);
    await user.click(toggle());
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), '   ');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
    fireEvent.submit(screen.getByPlaceholderText(PLACEHOLDER).closest('form')!);
    expect(await screen.findByText('Give the production a name.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('locks the form while creating', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((r) => (resolve = r)));
    render(<NewProjectForm />);
    await user.click(toggle());
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Nocturne');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeDisabled();
    resolve(json({ id: 'p1' }));
    await waitFor(() => expect(nav.router.push).toHaveBeenCalled());
  });

  it('shows an error, keeps the name and unlocks on failure', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'db down' }, 500));
    render(<NewProjectForm />);
    await user.click(toggle());
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Nocturne');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Couldn’t create that project. Try again.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('Nocturne');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('shows an error on a network failure', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    render(<NewProjectForm />);
    await user.click(toggle());
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Nocturne');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Couldn’t create that project. Try again.')).toBeInTheDocument();
  });

  it('hands a signed-out user to login without an error message', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = stubFetch(() => json({ error: 'not signed in' }, 401));
    render(<NewProjectForm />);
    await user.click(toggle());
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Nocturne');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Couldn’t create/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('clears the error when cancelled and reopened', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ id: 'p1' }));
    render(<NewProjectForm />);
    await user.click(toggle());
    fireEvent.submit(screen.getByPlaceholderText(PLACEHOLDER).closest('form')!);
    await screen.findByText('Give the production a name.');
    await user.click(toggle());
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument();
    await user.click(toggle());
    expect(screen.queryByText('Give the production a name.')).not.toBeInTheDocument();
  });
});
