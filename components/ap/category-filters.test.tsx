import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EMPTY_FACETS, type AttributeFacets } from '@/lib/category-filters';
import { CategoryFilters } from './category-filters';

// The filter rail: one section per attribute that has values, each value a
// link that toggles it in the URL (keeping the query and the other groups),
// counts beside values, "more" past eight, Clear all when anything is on.

const facets: AttributeFacets = {
  ...EMPTY_FACETS,
  era: [
    { value: '1920s', n: 831 },
    { value: '1950s', n: 728 },
  ],
  colors: [
    { value: 'black', n: 4146 },
    { value: 'gray', n: 900 },
  ],
  tags: Array.from({ length: 11 }, (_, i) => ({ value: `tag-${i}`, n: 100 - i })),
};

const group = (name: string) => within(screen.getByRole('region', { name }));

describe('CategoryFilters', () => {
  it('renders a section per attribute with values, their counts, and nothing for empty groups', () => {
    render(<CategoryFilters slug="lighting" query="" facets={facets} selected={{}} />);
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Era' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Colors' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Style' })).not.toBeInTheDocument();
    expect(group('Era').getByRole('link', { name: '1920s, 831' })).toBeInTheDocument();
    expect(group('Colors').getByRole('link', { name: 'black, 4,146' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('renders nothing at all when no group has values', () => {
    const { container } = render(
      <CategoryFilters slug="lighting" query="" facets={EMPTY_FACETS} selected={{}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('links each value to the page with that value toggled, keeping the query and other groups', () => {
    render(
      <CategoryFilters slug="lighting" query="brass" facets={facets} selected={{ colors: ['black'] }} />,
    );
    expect(group('Era').getByRole('link', { name: '1920s, 831' })).toHaveAttribute(
      'href',
      '/category/lighting?q=brass&era=1920s&colors=black',
    );
    // Selected: pressed, and its link removes it.
    const black = group('Colors').getByRole('link', { name: 'black, 4,146' });
    expect(black).toHaveAttribute('aria-pressed', 'true');
    expect(black).toHaveAttribute('href', '/category/lighting?q=brass');
    expect(group('Colors').getByRole('link', { name: 'gray, 900' })).toHaveAttribute(
      'href',
      '/category/lighting?q=brass&colors=black%2Cgray',
    );
    // Clear all keeps the query and drops every group.
    expect(screen.getByRole('link', { name: 'Clear all' })).toHaveAttribute('href', '/category/lighting?q=brass');
  });

  it('keeps a selected value the facets do not list, with a zero count, ahead of the list', () => {
    render(<CategoryFilters slug="lighting" query="" facets={facets} selected={{ era: ['1800s'] }} />);
    const links = group('Era').getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('1800s, 0');
    expect(links[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves a selected row where it was in the list', () => {
    render(<CategoryFilters slug="lighting" query="" facets={facets} selected={{ colors: ['gray'] }} />);
    const names = group('Colors').getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(names).toEqual(['black, 4,146', 'gray, 900']);
  });

  it('shows a selected row past the fold without expanding the group', () => {
    render(<CategoryFilters slug="lighting" query="" facets={facets} selected={{ tags: ['tag-10'] }} />);
    const tags = group('Tags');
    const names = tags.getAllByRole('link').map((l) => l.getAttribute('aria-label'));
    expect(names).toHaveLength(9);
    expect(names.at(-1)).toBe('tag-10, 90');
    expect(tags.getByRole('button', { name: '2 more' })).toBeInTheDocument();
  });

  it('shows eight values per group and the rest behind "more"', async () => {
    render(<CategoryFilters slug="lighting" query="" facets={facets} selected={{}} />);
    const tags = group('Tags');
    expect(tags.getAllByRole('link')).toHaveLength(8);
    await userEvent.click(tags.getByRole('button', { name: '3 more' }));
    expect(tags.getAllByRole('link')).toHaveLength(11);
    await userEvent.click(tags.getByRole('button', { name: 'Fewer' }));
    expect(tags.getAllByRole('link')).toHaveLength(8);
    expect(group('Era').queryByRole('button')).not.toBeInTheDocument();
  });

  it('counts the active selections on the Filters tab and folds the groups on small screens', async () => {
    render(
      <CategoryFilters slug="lighting" query="" facets={facets} selected={{ era: ['1920s'], colors: ['black'] }} />,
    );
    const tab = screen.getByRole('button', { name: /Filters 2/ });
    expect(tab).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('category-filter-groups')).toHaveClass('hidden', 'lg:block');
    await userEvent.click(tab);
    expect(tab).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('category-filter-groups')).not.toHaveClass('hidden');
  });
});
