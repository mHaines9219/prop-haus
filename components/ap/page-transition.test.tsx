import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageTransition } from './page-transition';

// The page paste-up: wraps its children in a flex column that fills the shell,
// keyed on the route so each navigation replays the entrance.

vi.mock('next/navigation', () => ({ usePathname: () => '/cart' }));

describe('PageTransition', () => {
  it('renders children inside a flex-1 wrapper', () => {
    render(
      <PageTransition className="pt-2">
        <p>sheet</p>
      </PageTransition>,
    );
    const el = screen.getByText('sheet').parentElement!;
    expect(el).toHaveAttribute('data-slot', 'page-transition');
    expect(el).toHaveClass('flex-1', 'pt-2');
  });
});
