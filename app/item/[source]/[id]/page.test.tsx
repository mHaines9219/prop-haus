// /item/[source]/[id]: not-found, id decoding, spec rows, enrichment, actions and the related strip.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCardItem, makePropItem } from '@/test/fixtures/catalog';
import ItemPage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/catalog-db', () => ({ getItemBySourceId: vi.fn(), relatedCards: vi.fn() }));

const catalog = vi.mocked(await import('@/lib/catalog-db'));

function props(source = 'omega', id = '12345') {
  return { params: Promise.resolve({ source, id }) };
}

function specValue(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling!;
}

beforeEach(() => {
  catalog.getItemBySourceId.mockReset();
  catalog.relatedCards.mockReset();
  catalog.relatedCards.mockResolvedValue([]);
});

describe('ItemPage', () => {
  it('404s when the item is missing, after decoding the id', async () => {
    catalog.getItemBySourceId.mockResolvedValue(undefined);
    await expect(ItemPage(props('omega', 'a%20b%2Fc'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(catalog.getItemBySourceId).toHaveBeenCalledWith('omega', 'a b/c');
    expect(catalog.relatedCards).not.toHaveBeenCalled();
  });

  it('renders the name, vendor, category link, specs, price and actions', async () => {
    catalog.getItemBySourceId.mockResolvedValue(makePropItem());
    render(await ItemPage(props()));

    expect(screen.getByRole('link', { name: 'Storage & Credenzas' })).toHaveAttribute(
      'href',
      '/category/storage-credenzas',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mid-century walnut credenza');
    expect(screen.getByText('Courtesy of Omega Cinema Props')).toBeInTheDocument();
    expect(screen.getByText('credenzas')).toBeInTheDocument();
    expect(screen.getByText('Six-foot walnut credenza with brass pulls.')).toBeInTheDocument();

    expect(specValue('Dimensions')).toHaveTextContent('W 72 x D 18 x H 30 IN');
    expect(specValue('Category')).toHaveTextContent('Storage & Credenzas');
    expect(specValue('Vendor')).toHaveTextContent('Omega Cinema Props');
    expect(specValue('Rental')).toHaveTextContent('$120.00/ WK');

    expect(screen.getByText('Era').nextElementSibling).toHaveTextContent('1960s');
    expect(screen.getByText('Materials').nextElementSibling).toHaveTextContent('walnutbrass');
    expect(screen.queryByText('Setting')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find Similar' })).toHaveAttribute(
      'href',
      `/search?q=${encodeURIComponent('credenzas 1960s mid-century warm')}`,
    );
    const outbound = screen.getByRole('link', { name: 'View on Omega Cinema Props' });
    expect(outbound).toHaveAttribute('href', 'https://omegacinemaprops.com/item/12345');
    expect(outbound).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/More in/)).not.toBeInTheDocument();
  });

  it('falls back to quote-on-request, drops empty rows and builds the similar query from the name', async () => {
    catalog.getItemBySourceId.mockResolvedValue(
      makePropItem({
        price: undefined,
        dimensions: undefined,
        subcategory: undefined,
        description: undefined,
        era: undefined,
        style: undefined,
        vibes: undefined,
        materials: undefined,
        colors: undefined,
        tags: undefined,
      }),
    );
    render(await ItemPage(props()));
    expect(specValue('Rental')).toHaveTextContent('Quote on request');
    expect(screen.queryByText('Dimensions')).not.toBeInTheDocument();
    expect(screen.queryByText('Era')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find Similar' })).toHaveAttribute(
      'href',
      `/search?q=${encodeURIComponent('Mid-century walnut credenza')}`,
    );
  });

  it('renders partial dimensions and a flat-fee unit', async () => {
    catalog.getItemBySourceId.mockResolvedValue(
      makePropItem({
        dimensions: { height: 12, unit: 'in' },
        price: { amount: 950, currency: 'USD', unit: 'event' },
      }),
    );
    render(await ItemPage(props()));
    expect(specValue('Dimensions')).toHaveTextContent('H 12 IN');
    expect(specValue('Dimensions')).not.toHaveTextContent('x');
    expect(specValue('Rental')).toHaveTextContent('$950.00FLAT');
  });

  it('shows gallery thumbnails when there is more than one image', async () => {
    catalog.getItemBySourceId.mockResolvedValue(
      makePropItem({ images: ['https://img.example/1.jpg', 'https://img.example/2.jpg'] }),
    );
    render(await ItemPage(props()));
    expect(screen.getByRole('button', { name: 'View image 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'View image 2' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the related strip without the item itself, capped at eight', async () => {
    catalog.getItemBySourceId.mockResolvedValue(makePropItem());
    catalog.relatedCards.mockResolvedValue([
      makeCardItem({ sourceId: '12345', name: 'Itself' }),
      ...Array.from({ length: 8 }, (_, i) => makeCardItem({ sourceId: `r${i}`, name: `Related ${i}` })),
    ]);
    render(await ItemPage(props()));

    expect(catalog.relatedCards).toHaveBeenCalledWith('storage-credenzas', 9);
    const strip = screen.getByRole('heading', { name: 'More in Storage & Credenzas' }).parentElement!;
    expect(within(strip).queryByText('Itself')).not.toBeInTheDocument();
    for (let i = 0; i < 8; i++) expect(within(strip).getByText(`Related ${i}`)).toBeInTheDocument();
  });

  it('caps the strip at eight even when nothing is filtered out', async () => {
    catalog.getItemBySourceId.mockResolvedValue(makePropItem());
    catalog.relatedCards.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => makeCardItem({ sourceId: `r${i}`, name: `Related ${i}` })),
    );
    render(await ItemPage(props()));
    expect(screen.getAllByText(/^Related \d$/)).toHaveLength(8);
    expect(screen.queryByText('Related 8')).not.toBeInTheDocument();
  });
});
