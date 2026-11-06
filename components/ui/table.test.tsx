import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table';

function Ledger() {
  return (
    <Table aria-label="Orders" className="min-w-[600px]">
      <TableCaption>2 orders</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Vendor</TableHead>
          <TableHead className="text-right">Items</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow data-state="selected">
          <TableCell>Newel</TableCell>
          <TableCell>3</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Prop N Spoon</TableCell>
          <TableCell>1</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('renders a semantic table with column heads, rows, cells and a caption', () => {
    render(<Ledger />);
    const table = screen.getByRole('table', { name: 'Orders' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Vendor', 'Items']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Newel', '3']);
    expect(screen.getByText('2 orders').tagName).toBe('CAPTION');
  });

  it('scrolls sideways inside its own wrapper so the page body never does', () => {
    render(<Ledger />);
    const table = screen.getByRole('table');
    expect(table).toHaveClass('w-full', 'min-w-[600px]');
    expect(table.parentElement).toHaveAttribute('data-slot', 'table-container');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
  });

  it('draws ink seams with radius 0, a heavy rule under the heads, and fills a selected row', () => {
    render(<Ledger />);
    const table = screen.getByRole('table');
    expect(table.querySelector('thead')).toHaveClass('[&_tr]:border-b-2', '[&_tr]:border-border-strong');
    const [, selected] = screen.getAllByRole('row');
    expect(selected).toHaveAttribute('data-state', 'selected');
    expect(selected).toHaveClass('border-b', 'data-[state=selected]:bg-surface-inset');
    expect(screen.getByRole('columnheader', { name: 'Items' })).toHaveClass('uppercase', 'text-right');
    for (const el of table.querySelectorAll('*')) expect(el.getAttribute('class') ?? '').not.toMatch(/\brounded/);
  });
});
