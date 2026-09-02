import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '@/lib/types';
import type { Allowance } from '@/lib/usage';
import { makeCardItem, makePropItem } from '@/test/fixtures/catalog';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import SearchPage from './page';

// The results page: keyword search rides the URL, AI search rides ?ai=1 and
// POSTs, a moodboard POSTs multipart, and the allowance counter follows what
// the server says it charged.

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => null }));
vi.mock('@/components/ap/site-footer', () => ({ SiteFooter: () => null }));
vi.mock('motion/react', async () => {
  const React = await import('react');
  const STRIP = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'whileFocus',
    'layout', 'layoutId', 'variants', 'onAnimationComplete',
  ]);
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

const allowance = (over: Partial<Allowance> = {}): Allowance => ({
  metric: 'aiSearchesPerDay',
  period: '2026-09-02',
  used: 2,
  limit: 5,
  remaining: 3,
  allowed: true,
  ...over,
});

const usageBody = (ai: Partial<Allowance> = {}, vision: Partial<Allowance> = {}) => ({
  plan: 'free',
  metrics: {
    aiSearchesPerDay: allowance(ai),
    visionSearches: allowance({ metric: 'visionSearches', period: 'lifetime', used: 0, limit: null, remaining: null, ...vision }),
  },
});

const card = makeCardItem();
const keywordBody = (query: string) => ({ query, matches: [{ item: card, matchedVia: ['name'], score: 1 }], total: 1 });

const aiBody = (over: Partial<SearchResponse & { usage?: Allowance }> = {}): SearchResponse & { usage?: Allowance } => ({
  mode: 'haiku',
  modelsUsed: ['model-a', 'model-b'],
  matches: [{ item: makePropItem(), matchedVia: ['ai'], score: 0.9 }],
  explanation: 'Warm woods and brass.',
  usage: allowance({ used: 3, remaining: 2 }),
  ...over,
});

function stubRoutes(routes: Partial<Record<'usage' | 'keyword' | 'search', Handler>> = {}) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const handler: Handler = url.startsWith('/api/usage')
      ? (routes.usage ?? (() => json(usageBody())))
      : url.startsWith('/api/keyword')
        ? (routes.keyword ?? ((u) => json(keywordBody(decodeURIComponent(u.split('q=')[1] ?? '')))))
        : url === '/api/search'
          ? (routes.search ?? (() => json(aiBody())))
          : () => json({ error: `unexpected ${url}` }, 404);
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SearchPage />
    </QueryClientProvider>,
  );
}

const calls = (fn: ReturnType<typeof stubRoutes>, prefix: string) =>
  fn.mock.calls.filter(([url]) => String(url).startsWith(prefix));

beforeEach(() => {
  resetNavigation();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('without a query', () => {
  it('shows the empty prompt and never hits the keyword endpoint', async () => {
    const fetchMock = stubRoutes();
    renderPage();
    expect(screen.getByText('Start a search')).toBeInTheDocument();
    await screen.findByText('3 of 5 AI searches left today');
    expect(calls(fetchMock, '/api/keyword')).toHaveLength(0);
    expect(calls(fetchMock, '/api/search')).toHaveLength(0);
  });

  it('joins every metered allowance and omits unlimited ones', async () => {
    stubRoutes({ usage: () => json(usageBody({}, { limit: 3, remaining: 1 })) });
    renderPage();
    expect(await screen.findByText('3 of 5 AI searches left today · 1 of 3 image searches left')).toBeInTheDocument();
  });

  it('shows no counter on an unlimited plan', async () => {
    stubRoutes({ usage: () => json(usageBody({ limit: null, remaining: null })) });
    renderPage();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it('survives a signed-out usage read', async () => {
    stubRoutes({ usage: () => json({ error: 'not signed in' }, 401) });
    renderPage();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText('Start a search')).toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });
});

describe('keyword search', () => {
  it('fetches the URL query and renders the matches as item cards', async () => {
    nav.searchParams = new URLSearchParams('q=walnut credenza');
    const fetchMock = stubRoutes();
    renderPage();
    expect(screen.getByRole('searchbox', { name: 'Search props' })).toHaveValue('walnut credenza');
    expect(await screen.findByText('1 match for “walnut credenza”')).toBeInTheDocument();
    expect(calls(fetchMock, '/api/keyword')[0][0]).toBe('/api/keyword?q=walnut%20credenza');
    expect(screen.getByText('Mid-century walnut credenza')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mid-century walnut credenza/ })).toHaveAttribute('href', '/item/omega/12345');
    expect(screen.getByRole('img', { name: 'Mid-century walnut credenza' })).toBeInTheDocument();
    expect(screen.getByText('Omega Cinema Props')).toBeInTheDocument();
  });

  it('shows the searching state while the request is open', () => {
    nav.searchParams = new URLSearchParams('q=lamp');
    stubRoutes({ keyword: () => new Promise<Response>(() => {}) });
    renderPage();
    expect(screen.getByText('Searching.')).toBeInTheDocument();
  });

  it('pluralises the total', async () => {
    nav.searchParams = new URLSearchParams('q=lamp');
    stubRoutes({ keyword: () => json({ query: 'lamp', matches: [{ item: card, matchedVia: [], score: 1 }], total: 1200 }) });
    renderPage();
    expect(await screen.findByText('1,200 matches for “lamp”')).toBeInTheDocument();
  });

  it('shows the zero-result state', async () => {
    nav.searchParams = new URLSearchParams('q=zebra');
    stubRoutes({ keyword: () => json({ query: 'zebra', matches: [], total: 0 }) });
    renderPage();
    expect(await screen.findByText('No metadata matches for “zebra”')).toBeInTheDocument();
    expect(screen.getByText('No direct matches')).toBeInTheDocument();
  });

  it('hands the query to AI from the curate button', async () => {
    const user = userEvent.setup();
    nav.searchParams = new URLSearchParams('q=credenza');
    stubRoutes();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ask AI to curate' }));
    expect(nav.router.push).toHaveBeenCalledWith('/search?q=credenza&ai=1');
  });

  it('navigates on a new text search', async () => {
    const user = userEvent.setup();
    nav.searchParams = new URLSearchParams('q=credenza');
    stubRoutes();
    renderPage();
    const box = screen.getByRole('searchbox', { name: 'Search props' });
    await user.clear(box);
    await user.type(box, 'brass lamp{Enter}');
    expect(nav.router.push).toHaveBeenCalledWith('/search?q=brass+lamp');
  });

  it('shows the generic error for a failed keyword read', async () => {
    nav.searchParams = new URLSearchParams('q=lamp');
    stubRoutes({ keyword: () => json({ error: 'index offline' }, 500) });
    renderPage();
    expect(await screen.findByText('That search did not go through')).toBeInTheDocument();
    expect(screen.getByText('index offline')).toBeInTheDocument();
  });
});

describe('AI text search', () => {
  it('POSTs the query once and renders the curated set with its model line', async () => {
    nav.searchParams = new URLSearchParams('q=noir office&ai=1');
    const fetchMock = stubRoutes();
    renderPage();
    expect(await screen.findByText('Warm woods and brass.')).toBeInTheDocument();

    const post = calls(fetchMock, '/api/search');
    expect(post).toHaveLength(1);
    expect(post[0][1]?.method).toBe('POST');
    expect(JSON.parse(post[0][1]?.body as string)).toEqual({ query: 'noir office', mode: 'text' });
    expect(screen.getByText('Mid-century walnut credenza')).toBeInTheDocument();
    expect(screen.getByText('haiku · model-a + model-b')).toBeInTheDocument();
    expect(calls(fetchMock, '/api/keyword')).toHaveLength(0);
  });

  it('shows the reading state while the request is open', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes({ search: () => new Promise<Response>(() => {}) });
    renderPage();
    expect(await screen.findByText('Reading the catalog.')).toBeInTheDocument();
  });

  it('folds the budget into the brief', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1&budget=1500');
    const fetchMock = stubRoutes();
    renderPage();
    await screen.findByText('Warm woods and brass.');
    expect(JSON.parse(calls(fetchMock, '/api/search')[0][1]?.body as string).query).toBe('loft\n\nBudget: $1,500');
  });

  it('updates the allowance from the charged usage in the response', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes();
    renderPage();
    expect(await screen.findByText('2 of 5 AI searches left today')).toBeInTheDocument();
  });

  it('shows the zero-result state', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes({ search: () => json(aiBody({ matches: [], explanation: undefined, modelsUsed: [] })) });
    renderPage();
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('haiku')).toBeInTheDocument();
  });

  it('shows the paywall on a 402 and refreshes the allowance', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    let usageReads = 0;
    const fetchMock = stubRoutes({
      search: () => json({ error: 'Daily AI search limit reached' }, 402),
      usage: () => json(usageBody(usageReads++ === 0 ? {} : { used: 5, remaining: 0 })),
    });
    renderPage();
    expect(await screen.findByText('Search limit reached')).toBeInTheDocument();
    expect(screen.getByText('Daily AI search limit reached')).toBeInTheDocument();
    await waitFor(() => expect(calls(fetchMock, '/api/usage').length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText('0 of 5 AI searches left today')).toBeInTheDocument();
  });

  it('shows the generic error for other failures', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes({ search: () => json({ error: 'model timeout' }, 500) });
    renderPage();
    expect(await screen.findByText('That search did not go through')).toBeInTheDocument();
    expect(screen.getByText('model timeout')).toBeInTheDocument();
    expect(screen.queryByText(/Copy .env.local.example/)).not.toBeInTheDocument();
  });

  it('adds the setup hint when the key is missing', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes({ search: () => json({ error: 'OPENROUTER_API_KEY is not set' }, 500) });
    renderPage();
    expect(await screen.findByText(/Copy \.env\.local\.example to \.env\.local/)).toBeInTheDocument();
  });

  it('reports a signed-out search as a failure', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes({ search: () => json({ error: 'not signed in' }, 401) });
    renderPage();
    expect(await screen.findByText('That search did not go through')).toBeInTheDocument();
    expect(screen.getByText('not signed in')).toBeInTheDocument();
  });

  // A 401 renders the same "did not go through" row as any other failure;
  // nothing links to /login.
  it.fails('points a signed-out searcher at login', async () => {
    nav.searchParams = new URLSearchParams('q=loft&ai=1');
    stubRoutes({ search: () => json({ error: 'not signed in' }, 401) });
    renderPage();
    await screen.findByText('That search did not go through');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', expect.stringContaining('/login'));
  });
});

describe('moodboard search', () => {
  const interpretation: NonNullable<SearchResponse['interpretation']> = {
    overall: { style: ['mid-century'], era: '1970s', vibes: ['warm'], settingType: ['apartment'], summary: 'A warm 70s living room' },
    detectedItems: [{ label: 'Credenza', description: 'Low walnut credenza' }],
    suggestedAdditions: [{ label: 'Brass lamp', reason: 'Fills the corner' }],
  };

  it('POSTs the files as multipart and renders the interpretation', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const fetchMock = stubRoutes({ search: () => json(aiBody({ interpretation, explanation: undefined })) });
    const { container } = renderPage();

    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['png'], 'board.png', { type: 'image/png' }));
    await user.click(container.querySelector('button[type=submit]')!);

    expect(await screen.findByText('AI read your moodboard')).toBeInTheDocument();
    const post = calls(fetchMock, '/api/search');
    expect(post).toHaveLength(1);
    const fd = post[0][1]?.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('mode')).toBe('haiku');
    expect((fd.get('files') as File).name).toBe('board.png');
    expect(fd.has('query')).toBe(false);

    expect(screen.getByRole('heading', { name: 'A warm 70s living room' })).toBeInTheDocument();
    for (const chip of ['mid-century', '1970s', 'warm', 'apartment', 'Credenza', 'Brass lamp']) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
    expect(screen.getByText('Detected items')).toBeInTheDocument();
    expect(screen.getByText('Tasteful additions')).toBeInTheDocument();
    expect(screen.getByText('Mid-century walnut credenza')).toBeInTheDocument();
  });
});
