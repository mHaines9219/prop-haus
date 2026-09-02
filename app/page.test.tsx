// Home page: meta-category rollups from catalogFacets, hidden zero counts, encoded suggestion links.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Facets } from '@/lib/catalog-db';
import HomePage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/catalog-db', () => ({ catalogFacets: vi.fn() }));

const catalog = vi.mocked(await import('@/lib/catalog-db'));

function facets(categories: Record<string, number>): Facets {
  return { categories, vendors: {}, total: Object.values(categories).reduce((a, b) => a + b, 0) };
}

beforeEach(() => {
  catalog.catalogFacets.mockReset();
});

describe('HomePage', () => {
  it('sums detailed slugs into meta-categories and links to the lead slug', async () => {
    catalog.catalogFacets.mockResolvedValue(
      facets({
        seating: 1200,
        'tables-desks': 300,
        'storage-credenzas': 45,
        lighting: 50,
        'artwork-wall': 10,
        sculptures: 5,
        'event-essentials': 1,
      }),
    );
    render(await HomePage());

    const furniture = screen.getByRole('link', { name: /Furniture/ });
    expect(furniture).toHaveAttribute('href', '/category/seating');
    expect(furniture).toHaveTextContent('1.5k items');

    expect(screen.getByRole('link', { name: /Lighting/ })).toHaveTextContent('50 items');
    const wall = screen.getByRole('link', { name: /Wall Decor & Mirrors/ });
    expect(wall).toHaveAttribute('href', '/category/mirrors-decorative-objects');
    expect(wall).toHaveTextContent('15 items');
    expect(screen.getByRole('link', { name: /Other/ })).toHaveAttribute('href', '/category/other');
  });

  it('hides meta-categories whose rollup is zero', async () => {
    catalog.catalogFacets.mockResolvedValue(facets({ lighting: 3 }));
    render(await HomePage());
    expect(screen.getByRole('link', { name: /Lighting/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Furniture/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Signage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Kitchen/ })).not.toBeInTheDocument();
  });

  it('renders no category shelf at all on an empty catalog', async () => {
    catalog.catalogFacets.mockResolvedValue(facets({}));
    render(await HomePage());
    expect(screen.queryByText(/items$/)).not.toBeInTheDocument();
    expect(screen.getByText('Every prop house.')).toBeInTheDocument();
  });

  it('encodes each suggestion into a /search link', async () => {
    catalog.catalogFacets.mockResolvedValue(facets({}));
    render(await HomePage());
    expect(screen.getByRole('link', { name: '70s apartment' })).toHaveAttribute('href', '/search?q=70s%20apartment');
    expect(screen.getByRole('link', { name: 'art deco speakeasy' })).toHaveAttribute(
      'href',
      '/search?q=art%20deco%20speakeasy',
    );
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText('How Prop Haus works')).toBeInTheDocument();
    expect(screen.getByTestId('site-nav')).toBeInTheDocument();
  });
});
