import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GridCell, SeamGrid } from './seam-grid';

// The ruled contact sheet: hairline seams via gap-px, and cells that can span 2x2.

describe('SeamGrid', () => {
  it('lays children on a 1px-gap grid over a border-colored track', () => {
    const { container } = render(
      <SeamGrid>
        <span>a</span>
        <span>b</span>
      </SeamGrid>,
    );
    expect(container.firstElementChild).toHaveClass('grid', 'gap-px', 'bg-border', 'grid-cols-2');
    expect(container.firstElementChild?.children).toHaveLength(2);
  });
});

describe('GridCell', () => {
  it('renders its child in a card-toned cell', () => {
    const { container } = render(
      <GridCell index={0}>
        <span>cell</span>
      </GridCell>,
    );
    expect(screen.getByText('cell')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-card');
    expect(container.firstElementChild).not.toHaveClass('col-span-2');
  });

  it('spans two rows and columns as a marquee', () => {
    const { container } = render(
      <GridCell index={30} marquee>
        <span>big</span>
      </GridCell>,
    );
    expect(container.firstElementChild).toHaveClass('col-span-2', 'row-span-2');
  });
});
