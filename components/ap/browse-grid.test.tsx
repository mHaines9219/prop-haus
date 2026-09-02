import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCart } from '@/lib/cart-store';
import type { CardItem } from '@/lib/types';
import { makeCardItem } from '@/test/fixtures/catalog';
import { BrowseGrid } from './browse-grid';

// The filterable contact sheet: seeded first page, filter fetches against
// /api/browse, load-more paging, skeleton / empty states, marquee cell.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants']);
  const strip = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => !MOTION.has(k)));
  const cache = new Map<string, React.FC<any>>();
  return {
    motion: new Proxy({}, {
      get: (_t, tag) => {
        const k = String(tag);
        if (!cache.has(k)) cache.set(k, ({ children, ...p }: any) => React.createElement(k, strip(p), children));
        return cache.get(k);
      },
    }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
  };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const item = (n: number, over: Partial<CardItem> = {}) =>
  makeCardItem({ sourceId: String(n), name: `Piece ${n}`, ...over });

const categories = [
  { slug: 'seating', name: 'Seating', count: 10 },
  { slug: 'lighting', name: 'Lighting', count: 3 },
];
const vendors = [{ id: 'omega', name: 'Omega', count: 5 }];

let fetchMock: ReturnType<typeof vi.fn>;

function renderGrid(over: Partial<React.ComponentProps<typeof BrowseGrid>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrowseGrid
        categories={categories}
        vendors={vendors}
        initialItems={[item(1), item(2)]}
        totalCatalog={3}
        vendorCount={4}
        {...over}
      />
    </QueryClientProvider>,
  );
}

const countLine = () =>
  screen.getByText((_, el) => el?.tagName === 'P' && el.className.includes('text-text-tertiary') && /^\d/.test(el.textContent ?? ''));
const lastUrl = () => new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'http://t');

describe('BrowseGrid', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] });
    fetchMock = vi.fn(async () => json({ items: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the seeded page without fetching, with the running count', () => {
    renderGrid();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Piece 1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Piece 2/ })).toBeInTheDocument();
    expect(countLine()).toHaveTextContent('3 pieces across 4 houses');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('marks the "all" rows pressed and lists every category and vendor with counts', () => {
    renderGrid();
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All vendors' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Seating\s?10$/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Omega\s?5$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Los Angeles, CA' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Seating' })).toBeInTheDocument();
  });

  it('loads the next page from the offset and appends it', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [item(3)], total: 3 }));
    renderGrid();
    const more = screen.getByRole('button', { name: 'Load more' });
    await userEvent.click(more);

    expect(lastUrl().pathname).toBe('/api/browse');
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ offset: '2', limit: '24' });
    expect(await screen.findByRole('link', { name: /Piece 3/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Load/ })).toBeNull();
  });

  it('hides load-more when the seed already holds everything', () => {
    renderGrid({ totalCatalog: 2 });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('fetches a filtered page from offset 0 and names the filter in the count', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [item(3)], total: 3 }));
    renderGrid();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('link', { name: /Piece 3/ });

    fetchMock.mockResolvedValueOnce(json({ items: [item(9, { name: 'Chair' })], total: 1 }));
    await userEvent.click(screen.getByRole('button', { name: /^Seating\s?10$/ }));

    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ category: 'seating', offset: '0', limit: '24' });
    expect(await screen.findByRole('link', { name: /Chair/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(countLine()).toHaveTextContent('1 item, Seating');
    expect(screen.getByRole('button', { name: /^Seating\s?10$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('combines vendor and category filters and clears both at once', async () => {
    fetchMock.mockResolvedValue(json({ items: [item(9, { name: 'Chair' })], total: 1 }));
    renderGrid();
    await userEvent.click(screen.getByRole('button', { name: /^Omega\s?5$/ }));
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ vendor: 'omega', offset: '0', limit: '24' });
    await screen.findByRole('link', { name: /Chair/ });

    await userEvent.click(screen.getByRole('button', { name: 'Lighting' }));
    expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ category: 'lighting', vendor: 'omega', offset: '0', limit: '24' });
    await waitFor(() => expect(countLine()).toHaveTextContent('1 item, Lighting, Omega'));

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('link', { name: /Piece 1/ })).toBeInTheDocument();
    expect(screen.getByText('pieces across')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('toggles a filter off when clicked again', async () => {
    fetchMock.mockResolvedValue(json({ items: [item(9, { name: 'Chair' })], total: 1 }));
    renderGrid();
    const row = screen.getByRole('button', { name: /^Seating\s?10$/ });
    await userEvent.click(row);
    await screen.findByRole('link', { name: /Chair/ });
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: /Piece 1/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows skeleton cells while a filter loads with nothing to keep on screen', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const { container } = renderGrid({ initialItems: [], totalCatalog: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Seating' }));

    expect(container.querySelectorAll('.animate-pulse.aspect-\\[4\\/5\\]')).toHaveLength(24);
    resolve(json({ items: [item(9, { name: 'Chair' })], total: 1 }));
    expect(await screen.findByRole('link', { name: /Chair/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  it('shows the empty state with a clear action when a filter matches nothing', async () => {
    renderGrid();
    await userEvent.click(screen.getByRole('button', { name: /^Seating\s?10$/ }));
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('No pieces match these filters.')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[1]);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('keeps the previous page on screen when a filter fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'boom' }, 500));
    renderGrid();
    await userEvent.click(screen.getByRole('button', { name: /^Seating\s?10$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument());
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByText('No matches')).toBeNull();
  });

  it('promotes the first photo-mode item to the marquee cell on the home page only', async () => {
    const { container } = renderGrid({
      initialItems: [item(1), item(2, { plateMode: 'photo' })],
      showMarquee: true,
    });
    const marquee = container.querySelector('.col-span-2.row-span-2');
    expect(marquee).not.toBeNull();
    expect(marquee).toHaveTextContent('Piece 2');
    expect(container.querySelectorAll('.col-span-2')).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(json({ items: [item(2, { plateMode: 'photo' })], total: 1 }));
    await userEvent.click(screen.getByRole('button', { name: /^Seating\s?10$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument());
    expect(container.querySelector('.col-span-2')).toBeNull();
  });

  it('falls back to the first item as marquee when nothing is photo mode', () => {
    const { container } = renderGrid({ showMarquee: true });
    expect(container.querySelector('.col-span-2')).toHaveTextContent('Piece 1');
  });

  it('renders no marquee by default', () => {
    const { container } = renderGrid({ initialItems: [item(1, { plateMode: 'photo' })] });
    expect(container.querySelector('.col-span-2')).toBeNull();
  });
});
