import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemCardSkeleton } from './item-card-skeleton';

// Placeholder cell: a pulsing 4:5 well plus three placard lines, no text.

describe('ItemCardSkeleton', () => {
  it('renders a pulsing well and three placard lines with no text', () => {
    const { container } = render(<ItemCardSkeleton />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
    expect(container.querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});
