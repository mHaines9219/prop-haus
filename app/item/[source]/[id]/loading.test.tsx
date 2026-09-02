// The item skeleton mirrors the detail layout: a matted image well and pulsing spec rows.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Loading from './loading';

vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));

describe('item Loading', () => {
  it('renders the skeleton layout', () => {
    const { container, getByTestId } = render(<Loading />);
    expect(getByTestId('site-nav')).toBeInTheDocument();
    expect(container.querySelector('.aspect-\\[4\\/5\\]')).not.toBeNull();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(10);
  });
});
