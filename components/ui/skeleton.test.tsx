import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('is a pulsing inset shape hidden from assistive tech, sized by the caller', () => {
    const { container } = render(<Skeleton className="h-4 w-24" data-testid="s" />);
    const el = container.firstElementChild!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('data-slot', 'skeleton');
    expect(el).toHaveAttribute('data-testid', 's');
    expect(el).toHaveClass('animate-pulse', 'bg-surface-inset', 'h-4', 'w-24');
    expect(el.className).not.toMatch(/\brounded/);
  });
});
