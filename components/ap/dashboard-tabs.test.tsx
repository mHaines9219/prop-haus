import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { DashboardTabs } from './dashboard-tabs';

// The dashboard sub-nav: /projects and /jobs presented as one Dashboard.

beforeEach(() => {
  resetNavigation();
});

describe('DashboardTabs', () => {
  it('links to both dashboard surfaces', () => {
    render(<DashboardTabs />);
    const tabs = screen.getByRole('navigation', { name: 'Dashboard sections' });
    expect(tabs).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
  });

  it('marks the tab for the current path, including nested routes', () => {
    nav.pathname = '/projects';
    const { rerender } = render(<DashboardTabs />);
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Jobs' })).not.toHaveAttribute('aria-current');

    nav.pathname = '/projects/p-1';
    rerender(<DashboardTabs />);
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');

    nav.pathname = '/jobs';
    rerender(<DashboardTabs />);
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
  });
});
