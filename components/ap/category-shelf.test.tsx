import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { CategoryShelf, STAMP_MS } from './category-shelf';

const reduceMotion = { value: false };
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => reduceMotion.value,
}));

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

// The drawing's click: a stamp plays, then the route is pushed. Anything
// that should not be held (modified clicks, reduced motion, tiles with no
// drawing) falls through to the plain link.
describe('CategoryShelf stamp on click', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNavigation();
    reduceMotion.value = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a plain click on a drawn tile for the stamp, then pushes the route', () => {
    render(<CategoryShelf categories={cats} />);
    const lighting = screen.getByRole('link', { name: /Lighting/ });
    expect(lighting).not.toHaveAttribute('data-stamping');

    const cancelled = !fireEvent.click(lighting);
    expect(cancelled).toBe(true);
    expect(lighting).toHaveAttribute('data-stamping');
    expect(nav.router.push).not.toHaveBeenCalled();

    vi.advanceTimersByTime(STAMP_MS);
    expect(nav.router.push).toHaveBeenCalledWith('/category/lighting');
  });

  it('lets a modified click through so a new tab opens as usual', () => {
    render(<CategoryShelf categories={cats} />);
    const lighting = screen.getByRole('link', { name: /Lighting/ });
    expect(fireEvent.click(lighting, { metaKey: true })).toBe(true);
    expect(lighting).not.toHaveAttribute('data-stamping');
    vi.advanceTimersByTime(STAMP_MS);
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('does not hold a tile that has no drawing', () => {
    render(<CategoryShelf categories={cats} />);
    const seating = screen.getByRole('link', { name: /Seating/ });
    expect(fireEvent.click(seating)).toBe(true);
    expect(seating).not.toHaveAttribute('data-stamping');
  });

  it('navigates at once under reduced motion', () => {
    reduceMotion.value = true;
    render(<CategoryShelf categories={cats} />);
    const lighting = screen.getByRole('link', { name: /Lighting/ });
    expect(fireEvent.click(lighting)).toBe(true);
    expect(lighting).not.toHaveAttribute('data-stamping');
    vi.advanceTimersByTime(STAMP_MS);
    expect(nav.router.push).not.toHaveBeenCalled();
  });
});
