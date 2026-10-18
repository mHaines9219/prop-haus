import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { CategorySearch } from './category-search';

// The in-category search bar: a submit routes back to the same category with
// ?q=, Clear appears only while a query is active, and the way out is the
// whole-catalogue search carrying the same words.

const input = () => screen.getByRole('searchbox', { name: 'Search Lighting' });

describe('CategorySearch', () => {
  beforeEach(() => {
    resetNavigation();
  });

  it('renders a search form named for the category', () => {
    render(<CategorySearch slug="lighting" name="Lighting" />);
    expect(screen.getByRole('search', { name: 'Search Lighting' })).toBeInTheDocument();
    expect(input()).toHaveAttribute('placeholder', 'Search Lighting');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'submit');
    expect(screen.getByText('Searches Lighting only')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search the whole catalogue' })).toHaveAttribute('href', '/search');
    expect(screen.queryByRole('link', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('routes a trimmed, encoded query to the category page on Enter', async () => {
    render(<CategorySearch slug="lighting" name="Lighting" />);
    await userEvent.type(input(), '  brass lamp  {Enter}');
    expect(nav.router.push).toHaveBeenCalledWith('/category/lighting?q=brass+lamp');
  });

  it('routes on the Search button too', async () => {
    render(<CategorySearch slug="tables-desks" name="Tables & Desks" />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Tables & Desks' }), 'walnut');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(nav.router.push).toHaveBeenCalledWith('/category/tables-desks?q=walnut');
  });

  it('does nothing for an empty or whitespace query', async () => {
    render(<CategorySearch slug="lighting" name="Lighting" />);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.type(input(), '   {Enter}');
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('prefills an active query and offers Clear and the catalogue-wide search', () => {
    render(<CategorySearch slug="lighting" name="Lighting" initialQuery="brass lamp" />);
    expect(input()).toHaveValue('brass lamp');
    expect(screen.getByRole('link', { name: 'Clear' })).toHaveAttribute('href', '/category/lighting');
    expect(screen.getByRole('link', { name: 'Search the whole catalogue' })).toHaveAttribute(
      'href',
      '/search?q=brass%20lamp',
    );
  });

  it('rules the box in coral while the field is focused', async () => {
    const { container } = render(<CategorySearch slug="lighting" name="Lighting" />);
    const box = container.querySelector('[data-slot="search-bar"]')!;
    expect(box).toHaveClass('border-ink');
    await userEvent.click(input());
    expect(box).toHaveClass('border-accent');
    await userEvent.tab();
    expect(box).toHaveClass('border-ink');
  });

  it('carries the rail filters through a submit and the Clear tab', async () => {
    render(
      <CategorySearch slug="lighting" name="Lighting" initialQuery="brass" filters={{ era: ['1920s'], colors: ['black', 'gray'] }} />,
    );
    expect(screen.getByRole('link', { name: 'Clear' })).toHaveAttribute(
      'href',
      '/category/lighting?era=1920s&colors=black%2Cgray',
    );
    await userEvent.clear(input());
    await userEvent.type(input(), 'sconce{Enter}');
    expect(nav.router.push).toHaveBeenCalledWith('/category/lighting?q=sconce&era=1920s&colors=black%2Cgray');
  });
});
