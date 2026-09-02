import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCart } from '@/lib/cart-store';
import { makeCardItem } from '@/test/fixtures/catalog';
import { ItemCard } from './item-card';

// The ruled-grid cell: one link to the item page, a LightWell plate, the
// placard (name / subcategory / vendor / camera-report line) and quick-add.

describe('ItemCard', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] });
  });

  it('renders the placard and links the whole cell to the item page', () => {
    const { container } = render(<ItemCard item={makeCardItem()} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/item/omega/12345');
    expect(link).toHaveTextContent('Mid-century walnut credenza');
    expect(link).toHaveTextContent('credenzas');
    expect(link).toHaveTextContent('Omega Cinema Props');
    expect(link).toHaveTextContent('120.00/WK');
    expect(container.querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull();
    expect(container.querySelector('.bg-plate')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Mid-century walnut credenza' })).toHaveAttribute('src', 'https://omegacinemaprops.com/img/12345.jpg');
  });

  it('URL-encodes the source id in the href', () => {
    render(<ItemCard item={makeCardItem({ sourceId: 'a b/c' })} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/item/omega/a%20b%2Fc');
  });

  it.each([
    [{ amount: 45, currency: 'USD', unit: 'day' as const }, '45.00/DAY'],
    [{ amount: 45, currency: 'USD', unit: 'purchase' as const }, '45.00/BUY'],
    [{ amount: 45, currency: 'USD', unit: 'event' as const }, '45.00/EVT'],
    [{ amount: 45, currency: 'USD', unit: 'month' as const }, '45.00/MO'],
    [{ amount: 45.5, currency: 'USD' }, '45.50'],
  ])('formats price %o as %s', (price, expected) => {
    render(<ItemCard item={makeCardItem({ price })} />);
    expect(screen.getByText(expected)).toHaveClass('font-mono', 'tabular-nums');
  });

  it('falls back to the rounded width when there is no price', () => {
    render(<ItemCard item={makeCardItem({ price: undefined, dimensions: { width: 72.4, unit: 'in' } })} />);
    expect(screen.getByText('W 72 IN')).toBeInTheDocument();
  });

  it('omits the data line when there is neither a price nor a width', () => {
    render(<ItemCard item={makeCardItem({ price: undefined, dimensions: { height: 30, unit: 'in' } })} />);
    expect(screen.queryByText(/IN$/)).toBeNull();
    expect(screen.queryByText(/\d\.\d\d/)).toBeNull();
    render(<ItemCard item={makeCardItem({ sourceId: 'x', price: undefined, dimensions: undefined })} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('survives a missing subcategory and no images', () => {
    render(<ItemCard item={makeCardItem({ subcategory: undefined, images: [] })} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getAllByText('Mid-century walnut credenza')).toHaveLength(2);
  });

  it('quick-adds to the cart without following the link', async () => {
    const item = makeCardItem();
    render(<ItemCard item={item} />);
    const add = screen.getByRole('button', { name: 'Add to cart' });
    const notPrevented = fireEvent.click(add);
    expect(notPrevented).toBe(false);
    expect(useCart.getState().lines.map((l) => l.item.id)).toEqual([item.id]);
    expect(screen.getByRole('button', { name: 'Added to cart' })).toBeInTheDocument();
  });

  it('shows the added state and refuses duplicates for an item already in the cart', async () => {
    const item = makeCardItem();
    useCart.getState().add({ ...item, images: item.images });
    render(<ItemCard item={item} />);
    const btn = screen.getByRole('button', { name: 'Added to cart' });
    await userEvent.click(btn);
    expect(useCart.getState().lines).toHaveLength(1);
  });

  it('uses the marquee layout when asked', () => {
    const { container } = render(<ItemCard item={makeCardItem()} marquee />);
    expect(screen.getByRole('link')).toHaveClass('flex', 'h-full', 'flex-col');
    expect(screen.getByText('Mid-century walnut credenza')).toHaveClass('text-[18px]');
    expect(container.querySelector('.h-full.w-full')).not.toBeNull();
    expect(container.querySelector('.aspect-\\[4\\/5\\]')).toBeNull();
  });

  it('switches the well to photo mode from plateMode', () => {
    const { container } = render(<ItemCard item={makeCardItem({ plateMode: 'photo' })} />);
    expect(screen.getByRole('img')).toHaveClass('object-cover');
    expect(container.querySelector('.bg-plate')).toBeNull();
  });
});
