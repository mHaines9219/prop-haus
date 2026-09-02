import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageShell } from './page-shell';

// The standard page frame: nav on top, main in the middle, footer credit.

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme: () => {} }) }));

describe('PageShell', () => {
  it('frames children between the nav and the footer', () => {
    render(
      <PageShell mainClassName="pt-8">
        <p>body copy</p>
      </PageShell>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveClass('flex-1', 'pt-8');
    expect(main).toHaveTextContent('body copy');
  });

  it('works without a main class', () => {
    render(<PageShell>x</PageShell>);
    expect(screen.getByRole('main')).toHaveClass('flex-1');
  });
});
