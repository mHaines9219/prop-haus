import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemCardSkeleton } from './item-card-skeleton';

// Placeholder cell: a pulsing 4:5 well plus the placard's four slots
// (headline, listing, vendor, price tag), no text.

describe('ItemCardSkeleton', () => {
  it('renders a pulsing well and four placard slots with no text', () => {
    const { container } = render(<ItemCardSkeleton />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
    expect(container.querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('holds the same placard slot heights as ItemCard so the swap does not move rows', () => {
    const { container } = render(<ItemCardSkeleton />);
    expect(container.querySelector('.min-h-\\[30px\\]')).not.toBeNull();
    expect(container.querySelector('.min-h-\\[14px\\]')).not.toBeNull();
    expect(container.querySelector('.min-h-\\[27px\\]')).not.toBeNull();
  });
});
