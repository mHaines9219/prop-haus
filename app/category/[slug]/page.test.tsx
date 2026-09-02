// /category/[slug]: unknown slug, count copy with the render cap, empty state, and the card grid.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCardItem } from '@/test/fixtures/catalog';
import CategoryPage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/catalog-db', () => ({ categoryCards: vi.fn() }));

const catalog = vi.mocked(await import('@/lib/catalog-db'));

function props(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  catalog.categoryCards.mockReset();
});

describe('CategoryPage', () => {
  it('404s on an unknown slug without hitting the catalog', async () => {
    await expect(CategoryPage(props('not-a-category'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(catalog.categoryCards).not.toHaveBeenCalled();
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
});
