// /category/[slug]: unknown slug, count copy with the render cap, empty state, the card grid,
// and the in-category search bar with its results view.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCardItem } from '@/test/fixtures/catalog';
import { EMPTY_FACETS } from '@/lib/category-filters';
import CategoryPage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/catalog-db', () => ({
  categoryCards: vi.fn(),
  filterCategoryCards: vi.fn(),
  categoryAttributeFacets: vi.fn(),
}));

const catalog = vi.mocked(await import('@/lib/catalog-db'));

function props(slug: string, search: Record<string, string | string[] | undefined> = {}) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) };
}

beforeEach(() => {
  catalog.categoryCards.mockReset();
  catalog.filterCategoryCards.mockReset();
  catalog.categoryAttributeFacets.mockReset();
  catalog.categoryAttributeFacets.mockResolvedValue({
    ...EMPTY_FACETS,
    era: [{ value: '1920s', n: 831 }],
    colors: [{ value: 'black', n: 4146 }],
  });
});

describe('CategoryPage', () => {
  it('404s on an unknown slug without hitting the catalog', async () => {
    await expect(CategoryPage(props('not-a-category'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(catalog.categoryCards).not.toHaveBeenCalled();
    expect(catalog.filterCategoryCards).not.toHaveBeenCalled();
    expect(catalog.categoryAttributeFacets).not.toHaveBeenCalled();
  });

  it('renders the category name, count and one card per item', async () => {
    catalog.categoryCards.mockResolvedValue({
      items: [
        makeCardItem({ sourceId: '1', name: 'Walnut credenza', category: 'seating' }),
        makeCardItem({ sourceId: '2', name: 'Brass lamp', category: 'seating' }),
        makeCardItem({ sourceId: '3', name: 'Velvet sofa', category: 'seating' }),
      ],
      total: 3,
    });
    render(await CategoryPage(props('seating')));

    expect(catalog.categoryCards).toHaveBeenCalledWith('seating', 120);
    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seating');
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('Walnut credenza')).toBeInTheDocument();
    expect(screen.getByText('Brass lamp')).toBeInTheDocument();
    expect(screen.getByText('Velvet sofa')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
    expect(catalog.filterCategoryCards).not.toHaveBeenCalled();
  });

  it('renders the filter rail from the category facets, nothing selected', async () => {
    catalog.categoryCards.mockResolvedValue({ items: [], total: 0 });
    render(await CategoryPage(props('lighting')));
    expect(catalog.categoryAttributeFacets).toHaveBeenCalledWith('lighting');
    const rail = within(screen.getByRole('complementary', { name: 'Filters' }));
    expect(rail.getByRole('link', { name: '1920s, 831' })).toHaveAttribute('href', '/category/lighting?era=1920s');
    expect(rail.getByRole('link', { name: 'black, 4,146' })).toHaveAttribute('href', '/category/lighting?colors=black');
    expect(rail.queryByRole('link', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('carries the search bar scoped to the category, empty when nothing is searched', async () => {
    catalog.categoryCards.mockResolvedValue({ items: [], total: 0 });
    render(await CategoryPage(props('lighting')));
    const bar = screen.getByRole('search', { name: 'Search Lighting' });
    expect(within(bar).getByRole('searchbox', { name: 'Search Lighting' })).toHaveValue('');
    expect(within(bar).getByText('Searches Lighting only')).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Search the whole catalogue' })).toHaveAttribute('href', '/search');
    expect(within(bar).queryByRole('link', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('notes the cap when the category holds more than it renders', async () => {
    catalog.categoryCards.mockResolvedValue({
      items: [makeCardItem({ sourceId: '1' }), makeCardItem({ sourceId: '2' })],
      total: 1500,
    });
    render(await CategoryPage(props('lighting')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lighting');
    expect(screen.getByText('1,500 items — showing the first 2')).toBeInTheDocument();
  });

  it('uses the singular for one item', async () => {
    catalog.categoryCards.mockResolvedValue({ items: [makeCardItem()], total: 1 });
    render(await CategoryPage(props('other')));
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('shows the empty state for a valid but empty category', async () => {
    catalog.categoryCards.mockResolvedValue({ items: [], total: 0 });
    render(await CategoryPage(props('rigged-effects')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rigged Effects');
    expect(screen.getByText('0 items')).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  describe('with ?q=', () => {
    it('searches the category instead of browsing it and lists the matches', async () => {
      catalog.filterCategoryCards.mockResolvedValue({
        items: [
          makeCardItem({ sourceId: '1', name: 'Brass table lamp', category: 'lighting' }),
          makeCardItem({ sourceId: '2', name: 'Brass sconce', category: 'lighting' }),
        ],
        capped: false,
      });
      render(await CategoryPage(props('lighting', { q: '  brass  ' })));

      expect(catalog.filterCategoryCards).toHaveBeenCalledWith('lighting', { query: 'brass', filters: {} }, 120);
      expect(catalog.categoryCards).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lighting');
      expect(screen.getByText('2 matches in Lighting for “brass”')).toBeInTheDocument();
      expect(screen.getByText('Brass table lamp')).toBeInTheDocument();
      expect(screen.getByText('Brass sconce')).toBeInTheDocument();
    });

    it('prefills the bar, offers Clear back to the browse page and the same query catalogue-wide', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [makeCardItem()], capped: false });
      render(await CategoryPage(props('lighting', { q: 'brass lamp' })));

      const bar = screen.getByRole('search', { name: 'Search Lighting' });
      expect(within(bar).getByRole('searchbox')).toHaveValue('brass lamp');
      expect(within(bar).getByRole('link', { name: 'Clear' })).toHaveAttribute('href', '/category/lighting');
      expect(within(bar).getByRole('link', { name: 'Search the whole catalogue' })).toHaveAttribute(
        'href',
        '/search?q=brass%20lamp',
      );
      expect(screen.getByText('1 match in Lighting for “brass lamp”')).toBeInTheDocument();
    });

    it('says the page is full when the search hit the render cap', async () => {
      catalog.filterCategoryCards.mockResolvedValue({
        items: [makeCardItem({ sourceId: '1' }), makeCardItem({ sourceId: '2' })],
        capped: true,
      });
      render(await CategoryPage(props('lighting', { q: 'lamp' })));
      expect(screen.getByText('Showing the first 2 matches in Lighting for “lamp”')).toBeInTheDocument();
    });

    it('shows the no-match state with a way out to the whole catalogue', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [], capped: false });
      render(await CategoryPage(props('lighting', { q: 'zeppelin' })));
      expect(screen.getByText('No matches in Lighting for “zeppelin”')).toBeInTheDocument();
      expect(screen.getByText('No matches in this category')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'search the whole catalogue' })).toHaveAttribute(
        'href',
        '/search?q=zeppelin',
      );
      expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
    });

    it('treats a blank or repeated q as a browse', async () => {
      catalog.categoryCards.mockResolvedValue({ items: [], total: 0 });
      render(await CategoryPage(props('lighting', { q: '   ' })));
      expect(catalog.filterCategoryCards).not.toHaveBeenCalled();
      expect(catalog.categoryCards).toHaveBeenCalledWith('lighting', 120);
    });

    it('takes the first of a repeated q and clips it to 200 characters', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [], capped: false });
      render(await CategoryPage(props('lighting', { q: ['x'.repeat(300), 'other'] })));
      expect(catalog.filterCategoryCards).toHaveBeenCalledWith('lighting', { query: 'x'.repeat(200), filters: {} }, 120);
    });
  });

  describe('with filters', () => {
    it('narrows by the rail selections, keeps them in the bar and marks them in the rail', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [makeCardItem({ sourceId: '1' })], capped: false });
      render(await CategoryPage(props('lighting', { era: '1920s', colors: 'black,gray', bogus: 'x' })));

      expect(catalog.filterCategoryCards).toHaveBeenCalledWith(
        'lighting',
        { query: '', filters: { era: ['1920s'], colors: ['black', 'gray'] } },
        120,
      );
      expect(catalog.categoryCards).not.toHaveBeenCalled();
      expect(screen.getByText('1 match in Lighting with 3 filters')).toBeInTheDocument();

      const rail = within(screen.getByRole('complementary', { name: 'Filters' }));
      expect(rail.getByRole('link', { name: '1920s, 831' })).toHaveAttribute('aria-pressed', 'true');
      expect(rail.getByRole('link', { name: '1920s, 831' })).toHaveAttribute('href', '/category/lighting?colors=black%2Cgray');
      expect(rail.getByRole('link', { name: 'gray, 0' })).toHaveAttribute('aria-pressed', 'true');
      expect(rail.getByRole('link', { name: 'Clear all' })).toHaveAttribute('href', '/category/lighting');
      // The bar has no query, so no Clear tab; a search from here would keep the filters.
      const bar = within(screen.getByRole('search', { name: 'Search Lighting' }));
      expect(bar.queryByRole('link', { name: 'Clear' })).not.toBeInTheDocument();
    });

    it('combines a query with filters in the count line and the links', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [makeCardItem({ sourceId: '1' }), makeCardItem({ sourceId: '2' })], capped: true });
      render(await CategoryPage(props('lighting', { q: 'brass', era: '1920s' })));
      expect(catalog.filterCategoryCards).toHaveBeenCalledWith('lighting', { query: 'brass', filters: { era: ['1920s'] } }, 120);
      expect(screen.getByText('Showing the first 2 matches in Lighting for “brass” with 1 filter')).toBeInTheDocument();
      const bar = within(screen.getByRole('search', { name: 'Search Lighting' }));
      expect(bar.getByRole('link', { name: 'Clear' })).toHaveAttribute('href', '/category/lighting?era=1920s');
      const rail = within(screen.getByRole('complementary', { name: 'Filters' }));
      expect(rail.getByRole('link', { name: 'Clear all' })).toHaveAttribute('href', '/category/lighting?q=brass');
    });

    it('offers to clear the filters when nothing matches', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [], capped: false });
      render(await CategoryPage(props('lighting', { q: 'zeppelin', era: '1920s' })));
      expect(screen.getByText('No matches in Lighting for “zeppelin” with 1 filter')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Clear the filters' })).toHaveAttribute('href', '/category/lighting?q=zeppelin');
      expect(screen.getByRole('link', { name: 'search the whole catalogue' })).toHaveAttribute('href', '/search?q=zeppelin');
    });

    it('offers only to clear the filters when there is no query', async () => {
      catalog.filterCategoryCards.mockResolvedValue({ items: [], capped: false });
      render(await CategoryPage(props('lighting', { era: '1800s' })));
      expect(screen.getByText('No matches in Lighting with 1 filter')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Clear the filters' })).toHaveAttribute('href', '/category/lighting');
      expect(screen.queryByRole('link', { name: 'search the whole catalogue' })).not.toBeInTheDocument();
    });
  });
});
