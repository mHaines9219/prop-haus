// DataTable: header sort controls, facet tabs, search, filtered-empty state
// with a clear action, and row-click navigation that yields to real controls.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import {
  DataTable,
  DataTableFacetTabs,
  DataTableSearch,
  createDataColumns,
  useDataTable,
} from './data-table';

type Piece = { id: string; name: string; kind: 'sofa' | 'lamp'; price: number };

const PIECES: Piece[] = [
  { id: 'a', name: 'Walnut credenza', kind: 'sofa', price: 300 },
  { id: 'b', name: 'Brass lamp', kind: 'lamp', price: 40 },
  { id: 'c', name: 'Arc lamp', kind: 'lamp', price: 120 },
];

const col = createDataColumns<Piece>();
const columns = col.columns([
  col.accessor('name', { header: 'Name', sortFn: 'text' }),
  col.accessor('kind', { header: 'Kind', filterFn: 'equals' }),
  col.accessor('price', { header: 'Price', sortDescFirst: true }),
  col.display({ id: 'actions', header: 'Actions', cell: () => <button type="button">Act</button> }),
]);

const onAct = vi.fn();

function Harness({ href = true, search = true }: { href?: boolean; search?: boolean }) {
  const table = useDataTable({
    data: PIECES,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: 'price', desc: true }],
    search: search ? (p) => p.name : undefined,
  });
  return (
    <div>
      <DataTableFacetTabs
        table={table}
        columnId="kind"
        label="Kind"
        allCount={3}
        options={[
          { value: 'sofa', label: 'Sofas', count: 1 },
          { value: 'lamp', label: 'Lamps', count: 2 },
        ]}
      />
      <DataTableSearch table={table} label="Search pieces" />
      <DataTable
        table={table}
        rowHref={href ? (p) => `/item/${p.id}` : undefined}
        columnClass={{ price: 'hidden sm:table-cell' }}
      />
    </div>
  );
}

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent);

beforeEach(() => {
  resetNavigation();
  onAct.mockReset();
});

describe('DataTable', () => {
  it('applies the initial sort and toggles direction from the header buttons', async () => {
    render(<Harness />);
    expect(names()).toEqual(['Walnut credenza', 'Arc lamp', 'Brass lamp']);
    const price = screen.getByRole('button', { name: 'Price' });
    expect(price.closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(price.closest('th')).toHaveClass('hidden', 'sm:table-cell');

    await userEvent.click(price);
    expect(names()).toEqual(['Brass lamp', 'Arc lamp', 'Walnut credenza']);
    expect(price.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    // Sorting never clears: a third click flips back rather than removing the sort.
    await userEvent.click(price);
    expect(price.closest('th')).toHaveAttribute('aria-sort', 'descending');

    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(names()).toEqual(['Arc lamp', 'Brass lamp', 'Walnut credenza']);
    expect(price.closest('th')).not.toHaveAttribute('aria-sort');

    // Display columns are not sortable and render a plain label.
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('narrows rows with the facet tabs and the search box together', async () => {
    render(<Harness />);
    const tabs = within(screen.getByRole('tablist', { name: 'Kind' }));
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All3', 'Sofas1', 'Lamps2']);
    expect(tabs.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(tabs.getByRole('tab', { name: /Lamps/ }));
    expect(names()).toEqual(['Arc lamp', 'Brass lamp']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search pieces' }), '  BRASS ');
    expect(names()).toEqual(['Brass lamp']);

    await userEvent.click(tabs.getByRole('tab', { name: /Sofas/ }));
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('Nothing here matches that filter.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(names()).toEqual(['Walnut credenza', 'Arc lamp', 'Brass lamp']);
    expect(tabs.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search pieces' })).toHaveValue('');
  });

  it('ignores the search box when the table has no search text', async () => {
    render(<Harness search={false} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search pieces' }), 'zzz');
    expect(names()).toHaveLength(3);
  });

  it('pushes the row destination on a plain click and leaves controls and modified clicks alone', async () => {
    render(<Harness />);
    const row = screen.getByText('Brass lamp').closest('tr')!;
    expect(row).toHaveClass('cursor-pointer');

    await userEvent.click(within(row).getByText('lamp'));
    expect(nav.router.push).toHaveBeenCalledWith('/item/b');

    nav.router.push.mockClear();
    await userEvent.click(within(row).getByRole('button', { name: 'Act' }));
    expect(nav.router.push).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(within(row).getByText('lamp'));
    await user.keyboard('{/Control}');
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it('renders inert rows without a destination', async () => {
    render(<Harness href={false} />);
    const row = screen.getByText('Brass lamp').closest('tr')!;
    expect(row).not.toHaveClass('cursor-pointer');
    await userEvent.click(within(row).getByText('lamp'));
    expect(nav.router.push).not.toHaveBeenCalled();
  });
});
