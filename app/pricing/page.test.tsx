// Rate card page: the three tiers and the questions, inside the page shell.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PricingPage from './page';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

describe('PricingPage', () => {
  it('renders the title, every tier and the questions', () => {
    render(<PricingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Search free. Pay for the work.');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByRole('article', { name: 'Coordinator' })).toBeInTheDocument();
    expect(screen.getByText('Do I need a plan to search?')).toBeInTheDocument();
    expect(screen.getByText('Does the prop house pay anything?')).toBeInTheDocument();
    expect(screen.getByText(/Cancel any time/)).toBeInTheDocument();
  });
});
