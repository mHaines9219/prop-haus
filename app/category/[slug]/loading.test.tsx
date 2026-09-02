// The category skeleton renders twelve pulsing card placeholders inside the page frame.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Loading from './loading';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

describe('category Loading', () => {
  it('renders the skeleton grid', () => {
    const { container, getByTestId } = render(<Loading />);
    expect(getByTestId('site-nav')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(12);
  });
});
