import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectItemInput } from '@/lib/projects';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { ClipForm } from './clip-form';

// "Add from the web": URL → /api/clip preview → confirm → folder items route.
// An unreadable page drops to a manual form seeded with the server's draft.

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

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const ITEMS_URL = '/api/projects/p1/folders/f1/items';

const parsed: ProjectItemInput = {
  itemId: 'clip-abc',
  source: 'clip',
  sourceId: 'abc',
  name: 'Velvet sofa',
  image: 'https://img.example/sofa.jpg',
  sourceUrl: 'https://wayfair.com/p/1',
  meta: { retailer: 'wayfair.com', price: { amount: 1200, currency: 'USD' } },
};

const draft = {
  itemId: 'clip-def',
  source: 'clip' as const,
  sourceId: 'def',
  sourceUrl: 'https://cb2.com/p/2',
  retailer: 'cb2.com',
};

function stubRoutes(clip: Handler = () => json({ item: parsed }), save: Handler = () => json({ ok: true }, 201)) {
  return stubFetch((url, init) => (url === '/api/clip' ? clip(url, init) : url === ITEMS_URL ? save(url, init) : json({}, 404)));
}

const toggle = () => screen.getByRole('button', { name: /Add from the web|Cancel/ });
const urlBox = () => screen.getByPlaceholderText('Paste a product link (e.g. wayfair.com/…)');
const fetchButton = () => screen.getByRole('button', { name: /Fetch|Reading…/ });

async function openWith(user: ReturnType<typeof userEvent.setup>, url: string) {
  await user.click(toggle());
  await user.type(urlBox(), url);
  await user.click(fetchButton());
}

function renderForm(existingItemIds: string[] = []) {
  return render(<ClipForm projectId="p1" folderId="f1" existingItemIds={existingItemIds} />);
}

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('opening', () => {
  it('starts collapsed and opens into a URL field with Fetch disabled', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(toggle());
    expect(toggle()).toHaveTextContent('Cancel');
    expect(urlBox()).toHaveAttribute('type', 'url');
    expect(fetchButton()).toBeDisabled();
    expect(screen.getByText(/don’t enter the catalog or cart/)).toBeInTheDocument();
  });

  it('resets everything on Cancel', async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    await screen.findByText('Velvet sofa');
    await user.click(toggle());
    expect(screen.queryByText('Velvet sofa')).not.toBeInTheDocument();
    await user.click(toggle());
    expect(urlBox()).toHaveValue('');
  });
});

describe('URL validation', () => {
  it.each(['ftp://files.example/x', 'javascript:alert(1)'])('refuses the scheme of %s without a request', async (bad) => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    renderForm();
    await openWith(user, bad);
    expect(await screen.findByText('Paste a full http(s) product link.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['wayfair.com/p/1', '//evil.example/x'])('lets the browser block the non-URL %s', async (bad) => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    renderForm();
    await openWith(user, bad);
    expect(urlBox()).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('preview', () => {
  it('POSTs the trimmed URL and shows the parsed item', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    renderForm();
    await openWith(user, '  https://wayfair.com/p/1  ');
    expect(await screen.findByText('Velvet sofa')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/clip');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ url: 'https://wayfair.com/p/1' });
    expect(screen.getByText('wayfair.com · $1,200.00')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Velvet sofa' })).toHaveAttribute('src', parsed.image);
    expect(screen.getByRole('button', { name: 'Save to folder' })).toBeInTheDocument();
    expect(screen.queryByText('Already in this folder')).not.toBeInTheDocument();
  });

  it('shows Reading… and locks the field while fetching', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubRoutes(() => new Promise<Response>((r) => (resolve = r)));
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    expect(screen.getByRole('button', { name: 'Reading…' })).toBeDisabled();
    expect(urlBox()).toBeDisabled();
    resolve(json({ item: parsed }));
    await screen.findByText('Velvet sofa');
  });

  it('renders a preview without price or image', async () => {
    const user = userEvent.setup();
    stubRoutes(() => json({ item: { ...parsed, image: undefined, meta: { retailer: 'wayfair.com' } } }));
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    expect(await screen.findByText('Velvet sofa', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('wayfair.com')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('flags a duplicate and offers Save again', async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderForm(['clip-abc']);
    await openWith(user, 'https://wayfair.com/p/1');
    expect(await screen.findByText('Already in this folder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save again' })).toBeInTheDocument();
  });

  it('discards the preview', async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Velvet sofa')).not.toBeInTheDocument();
    expect(urlBox()).toHaveValue('');
  });

  it('saves the parsed item to the folder, closes and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes();
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    await user.click(await screen.findByRole('button', { name: 'Save to folder' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    const save = fetchMock.mock.calls.find(([url]) => url === ITEMS_URL)!;
    expect(save[1]?.method).toBe('POST');
    expect(JSON.parse(save[1]?.body as string)).toEqual({ items: [parsed] });
    expect(toggle()).toHaveTextContent('Add from the web');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows Saving… while the save is open', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    stubRoutes(undefined, () => new Promise<Response>((r) => (resolve = r)));
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    await user.click(await screen.findByRole('button', { name: 'Save to folder' }));
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    resolve(json({ ok: true }, 201));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
  });

  it.each([
    ['a server error', () => json({ error: 'nope' }, 500)],
    ['a network failure', () => Promise.reject(new TypeError('offline')) as Promise<Response>],
  ])('reports %s on save and keeps the row open', async (_label, save) => {
    const user = userEvent.setup();
    stubRoutes(undefined, save);
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    await user.click(await screen.findByRole('button', { name: 'Save to folder' }));
    expect(await screen.findByText('Couldn’t save that item. Try again.')).toBeInTheDocument();
    expect(nav.router.refresh).not.toHaveBeenCalled();
    expect(toggle()).toHaveTextContent('Cancel');
  });
});

describe('fetch failures', () => {
  it.each([
    ['429', () => json({ error: 'slow down' }, 429), 'That’s a lot of clipping. Give it a few minutes and try again.'],
    ['502', () => json({ error: 'upstream' }, 502), 'That link can’t be reached. Check the URL or add the item by hand.'],
    ['422 without a draft', () => json({}, 422), 'Something went wrong reading that page.'],
    ['a network failure', () => Promise.reject(new TypeError('offline')) as Promise<Response>, 'Something went wrong reading that page.'],
  ])('explains %s', async (_label, clip, message) => {
    const user = userEvent.setup();
    stubRoutes(clip);
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(fetchButton()).toBeEnabled();
    expect(urlBox()).toHaveValue('https://wayfair.com/p/1');
  });

  it('sends a signed-out user to login without showing an error', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = stubRoutes(() => json({ error: 'not signed in' }, 401));
    renderForm();
    await openWith(user, 'https://wayfair.com/p/1');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/went wrong|can’t be reached/)).not.toBeInTheDocument();
  });
});

describe('manual entry', () => {
  const manual = () => stubRoutes(() => json({ draft }, 422));

  it('drops to a manual form seeded with the draft', async () => {
    const user = userEvent.setup();
    manual();
    renderForm();
    await openWith(user, 'https://cb2.com/p/2');
    expect(await screen.findByText('Couldn’t read cb2.com automatically. Add the details by hand.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Image URL (optional)')).toHaveAttribute('type', 'url');
    expect(screen.getByRole('button', { name: 'Save to folder' })).toBeInTheDocument();
  });

  it('warns when the draft is already in the folder', async () => {
    const user = userEvent.setup();
    manual();
    renderForm(['clip-def']);
    await openWith(user, 'https://cb2.com/p/2');
    expect(await screen.findByText(/already in the folder — saving again won’t duplicate it/)).toBeInTheDocument();
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    const fetchMock = manual();
    renderForm();
    await openWith(user, 'https://cb2.com/p/2');
    await user.click(await screen.findByRole('button', { name: 'Save to folder' }));
    expect(await screen.findByText('Give the item a name.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === ITEMS_URL)).toHaveLength(0);
  });

  it('rejects a non-http image link', async () => {
    const user = userEvent.setup();
    const fetchMock = manual();
    renderForm();
    await openWith(user, 'https://cb2.com/p/2');
    await user.type(await screen.findByLabelText('Name'), 'Oak stool');
    await user.type(screen.getByLabelText('Image URL (optional)'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Save to folder' }));
    expect(await screen.findByText('The image link must be a full http(s) URL.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === ITEMS_URL)).toHaveLength(0);
  });

  it('saves the hand-entered item with the draft identity and retailer', async () => {
    const user = userEvent.setup();
    const fetchMock = manual();
    renderForm();
    await openWith(user, 'https://cb2.com/p/2');
    await user.type(await screen.findByLabelText('Name'), '  Oak stool  ');
    await user.type(screen.getByLabelText('Image URL (optional)'), 'https://img.example/stool.jpg');
    await user.click(screen.getByRole('button', { name: 'Save to folder' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    const save = fetchMock.mock.calls.find(([url]) => url === ITEMS_URL)!;
    expect(JSON.parse(save[1]?.body as string)).toEqual({
      items: [
        {
          itemId: 'clip-def',
          source: 'clip',
          sourceId: 'def',
          name: 'Oak stool',
          image: 'https://img.example/stool.jpg',
          sourceUrl: 'https://cb2.com/p/2',
          meta: { retailer: 'cb2.com' },
        },
      ],
    });
  });

  it('omits the image when left blank', async () => {
    const user = userEvent.setup();
    const fetchMock = manual();
    renderForm();
    await openWith(user, 'https://cb2.com/p/2');
    await user.type(await screen.findByLabelText('Name'), 'Oak stool');
    await user.click(screen.getByRole('button', { name: 'Save to folder' }));
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    const save = fetchMock.mock.calls.find(([url]) => url === ITEMS_URL)!;
    expect(JSON.parse(save[1]?.body as string).items[0]).not.toHaveProperty('image');
  });

  it('discards the manual form', async () => {
    const user = userEvent.setup();
    manual();
    renderForm();
    await openWith(user, 'https://cb2.com/p/2');
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(urlBox()).toHaveValue('');
  });
});
