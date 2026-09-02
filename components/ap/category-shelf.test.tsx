import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryShelf } from './category-shelf';

// The home-page category tiles: link targets, ordinal + count formatting, and
// the odd-count last tile stretching across both columns.

const cats = [
  { name: 'Seating', href: '/category/seating', count: 999 },
  { name: 'Lighting', href: '/category/lighting', count: 1000 },
  { name: 'Tables', href: '/category/tables', count: 1550 },
];

describe('CategoryShelf', () => {
  it('renders nothing when there are no categories', () => {
    const { container } = render(<CategoryShelf categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each category with its ordinal and a compact count', () => {
    render(<CategoryShelf categories={cats} />);
    const seating = screen.getByRole('link', { name: /Seating/ });
    expect(seating).toHaveAttribute('href', '/category/seating');
    expect(seating).toHaveTextContent('01');
    expect(seating).toHaveTextContent('999 items');
    expect(screen.getByRole('link', { name: /Lighting/ })).toHaveTextContent('02');
    expect(screen.getByRole('link', { name: /Lighting/ })).toHaveTextContent('1k items');
    expect(screen.getByRole('link', { name: /Tables/ })).toHaveTextContent('1.6k items');
  });

  it('spans the last tile across both columns only for an odd count', () => {
    const { rerender } = render(<CategoryShelf categories={cats} />);
    const links = screen.getAllByRole('link');
    expect(links[2]).toHaveClass('col-span-2');
    expect(links[0]).not.toHaveClass('col-span-2');

    rerender(<CategoryShelf categories={cats.slice(0, 2)} />);
    for (const l of screen.getAllByRole('link')) expect(l).not.toHaveClass('col-span-2');
  });

  it('formats a count that rounds to a whole thousand without a trailing .0', () => {
    render(<CategoryShelf categories={[{ name: 'Decor', href: '/d', count: 12040 }]} />);
    expect(screen.getByRole('link')).toHaveTextContent('12k items');
  });
});
