import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCart } from '@/lib/cart-store';
import { makePropItem } from '@/test/fixtures/catalog';
import { AddToCart } from './add-to-cart';

// The item-detail primary action: one click puts the piece in the zustand cart
// and the button settles into its "in cart" state without double-adding.

describe('AddToCart', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers "Add to cart" when the piece is not in the cart', () => {
    render(<AddToCart item={makePropItem()} />);
    const btn = screen.getByRole('button', { name: 'Add to cart' });
    expect(btn).toHaveClass('border-accent');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('adds a one-image snapshot of the item to the store on click', async () => {
    const item = makePropItem({ images: ['https://x.test/a.jpg', 'https://x.test/b.jpg'] });
    render(<AddToCart item={item} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(useCart.getState().lines).toEqual([
      {
        item: {
          id: item.id,
          source: item.source,
          sourceId: item.sourceId,
          name: item.name,
          images: ['https://x.test/a.jpg'],
          sourceUrl: item.sourceUrl,
          category: item.category,
        },
      },
    ]);
    const btn = screen.getByRole('button', { name: 'In your cart' });
    expect(btn).toHaveClass('border-border');
    expect(btn).not.toHaveClass('border-accent');
  });

  it('reads "In your cart" from the start when the store already holds the item', () => {
    const item = makePropItem();
    useCart.getState().add({
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      name: item.name,
      images: item.images,
      sourceUrl: item.sourceUrl,
      category: item.category,
    });
    render(<AddToCart item={item} />);
    expect(screen.getByRole('button', { name: 'In your cart' })).toBeInTheDocument();
  });

  it('never duplicates a line on repeated clicks', async () => {
    render(<AddToCart item={makePropItem()} />);
    const btn = screen.getByRole('button');
    await userEvent.click(btn);
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(useCart.getState().lines).toHaveLength(1);
  });

  it('drops the confirmation after 1.4s once the item leaves the cart', () => {
    vi.useFakeTimers();
    const item = makePropItem();
    render(<AddToCart item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    act(() => useCart.getState().remove(item.id));
    expect(screen.getByRole('button', { name: 'In your cart' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('copes with an item that has no images', async () => {
    render(<AddToCart item={makePropItem({ images: [] })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(useCart.getState().lines[0].item.images).toEqual([]);
  });
});
