// Rate card: one ad per tier, the monthly rate as the tag, excluded lines marked, CTAs to sign-in.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRICING_TIERS } from '@/lib/pricing';
import { PricingSection, PricingTiers } from './pricing-tiers';

describe('PricingTiers', () => {
  it('renders every tier with its name, rate and CTA', () => {
    render(<PricingTiers />);
    const ads = screen.getAllByRole('article');
    expect(ads).toHaveLength(PRICING_TIERS.length);

    const free = screen.getByRole('article', { name: 'Browse' });
    expect(within(free).getByText('Free')).toBeInTheDocument();
    expect(within(free).queryByText('per month')).not.toBeInTheDocument();
    expect(within(free).getByRole('link', { name: 'Start browsing' })).toHaveAttribute('href', '/login');

    const directory = screen.getByRole('article', { name: 'Directory' });
    expect(within(directory).getByText('$29')).toBeInTheDocument();
    expect(within(directory).getByText('per month')).toBeInTheDocument();
    expect(within(directory).getByRole('link', { name: 'Start Directory' })).toHaveAttribute(
      'href',
      '/login?next=%2Faccount%3Fplan%3Ddirectory',
    );

    const coordinator = screen.getByRole('article', { name: 'Coordinator' });
    expect(within(coordinator).getByText('$100')).toBeInTheDocument();
    expect(within(coordinator).getByText('For most productions')).toBeInTheDocument();
  });

  it('marks excluded features for screen readers and keeps included ones plain', () => {
    render(<PricingTiers />);
    const free = screen.getByRole('article', { name: 'Browse' });
    expect(within(free).getByText('Prop house names and links').parentElement).toHaveTextContent(
      'Prop house names and links (not included)',
    );
    expect(within(free).getByText('Search every piece in the catalog').parentElement).not.toHaveTextContent(
      'not included',
    );
  });

  it('only the recommended tier wears the index tab', () => {
    render(<PricingTiers />);
    expect(screen.getAllByText('For most productions')).toHaveLength(1);
  });
});

describe('PricingSection', () => {
  it('is the Rates section with a link to the full rate card', () => {
    render(<PricingSection />);
    expect(screen.getByRole('region', { name: 'Rates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full rate card' })).toHaveAttribute('href', '/pricing');
  });
});
