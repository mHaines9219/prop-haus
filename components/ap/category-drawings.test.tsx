import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryDrawing, hasCategoryDrawing } from './category-drawings';

const HOME_CATEGORIES = [
  'Wall Decor & Mirrors',
  'Lighting',
  'Signage',
  'Accessories & Props',
  'Kitchen & Tableware',
  'Furniture',
  'Textiles & Rugs',
  'Bed & Bath',
  'Other',
];

describe('CategoryDrawing', () => {
  it.each(HOME_CATEGORIES)('draws %s in ink as a decorative svg with a floor and its pieces', (name) => {
    expect(hasCategoryDrawing(name)).toBe(true);
    const { container } = render(<CategoryDrawing name={name} className="h-20" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveClass('category-drawing', 'h-20');
    expect(svg.querySelector('.drawing-floor')?.children.length).toBeGreaterThan(0);
    expect(svg.querySelector('.drawing-objects')?.children.length).toBeGreaterThan(0);
  });

  it('draws nothing for a category it has no drawing for', () => {
    expect(hasCategoryDrawing('Taxidermy')).toBe(false);
    const { container } = render(<CategoryDrawing name="Taxidermy" />);
    expect(container.innerHTML).toBe('');
  });

  it('carries no stray class when none is given', () => {
    const { container } = render(<CategoryDrawing name="Lighting" />);
    expect(container.querySelector('svg')).toHaveAttribute('class', 'category-drawing');
  });

  it('inherits its color from the text, never a hard-coded one', () => {
    for (const name of HOME_CATEGORIES) {
      const { container, unmount } = render(<CategoryDrawing name={name} />);
      for (const el of container.querySelectorAll('svg *')) {
        expect(el.getAttribute('stroke')).toBeNull();
        expect(el.getAttribute('fill')).toBeNull();
      }
      unmount();
    }
  });
});
