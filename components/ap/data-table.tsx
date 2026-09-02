'use client';

/**
 * DataTable — the one sortable, filterable list surface for the dashboard
 * pages (/jobs, /projects). TanStack Table v9 does the state and row models;
 * the shadcn Table/Tabs/Input primitives in components/ui carry the Answer
 * Print skin. List rows, hairline seams, radius 0 (DESIGN.md §9.7).
 *
 * Usage:
 *
 *   const col = createDataColumns<Row>();
 *   const columns = col.columns([col.accessor('name', { header: 'Name' }), ...]);
 *   const table = useDataTable({ data, columns, getRowId: (r) => r.id, search: (r) => r.name });
 *   <DataTableSearch table={table} label="Search projects" />
 *   <DataTable table={table} rowHref={(r) => `/projects/${r.id}`} />
 *
 * Columns are defined once at module scope (TanStack wants stable inputs), and
 * only the features registered in `dataTableFeatures` exist on the instance:
 * sorting, a per-column filter (`equals`, for the facet tabs) and a global
 * search over `search(row)`.
 */

import { useMemo, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equals,
  filterFn_includesString,
  flexRender,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ReactTable,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { equals: filterFn_equals, includesString: filterFn_includesString },
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableInstance<TData extends object> = ReactTable<DataTableFeatures, TData>;
export type DataTableColumn<TData extends object> = ColumnDef<DataTableFeatures, TData, any>;
export type DataTableRow<TData extends object> = Row<DataTableFeatures, TData>;

/** A column helper typed for this table's feature set. Call once per row type, at module scope. */
export function createDataColumns<TData extends object>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export function useDataTable<TData extends object>({
  data,
  columns,
  getRowId,
  initialSorting,
  search,
}: {
  data: TData[];
  columns: DataTableColumn<TData>[];
  getRowId: (row: TData) => string;
  /** Sort applied on first render; the header controls take over from there. */
  initialSorting?: SortingState;
  /** Text the search box matches against, per row. Case-insensitive substring. */
  search?: (row: TData) => string;
}): DataTableInstance<TData> {
  const globalFilterFn = useMemo(() => {
    if (!search) return undefined;
    return (row: Row<DataTableFeatures, TData>, _columnId: string, value: unknown) => {
      const needle = String(value ?? '')
        .trim()
        .toLowerCase();
      return needle === '' || search(row.original).toLowerCase().includes(needle);
    };
  }, [search]);

  const initialState = useMemo(() => ({ sorting: initialSorting ?? [] }), [initialSorting]);

  return useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    initialState,
    enableSortingRemoval: false,
    enableMultiSort: false,
    globalFilterFn,
    // One evaluation per row is enough: the search text is row-level, so let
    // the first accessor column carry it and keep the rest out of the loop.
    getColumnCanGlobalFilter: (column) => Boolean(search) && column.id === firstAccessorId(columns),
  });
}

function firstAccessorId<TData extends object>(columns: DataTableColumn<TData>[]): string | undefined {
  for (const c of columns) {
    if ('accessorFn' in c || 'accessorKey' in c) {
      if (c.id) return c.id;
      if ('accessorKey' in c && typeof c.accessorKey === 'string') return c.accessorKey.replace(/\./g, '_');
    }
  }
  return undefined;
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

export function DataTable<TData extends object>({
  table,
  rowHref,
  columnClass,
  emptyLabel = 'No matches',
  emptyBody = 'Nothing here matches that filter.',
  className,
}: {
  table: DataTableInstance<TData>;
  /** Makes the whole row a click target for this destination. Put a real link in a cell too, for keyboards and readers. */
  rowHref?: (row: TData) => string;
  /** Extra classes per column id, applied to that column's header and cells (e.g. `hidden md:table-cell`). */
  columnClass?: Record<string, string>;
  /** Copy for the filtered-empty state (DESIGN.md §9.9). The unfiltered-empty state belongs to the page. */
  emptyLabel?: string;
  emptyBody?: string;
  className?: string;
}) {
  const router = useRouter();
  const rows = table.getRowModel().rows;
  const colCount = table.getAllLeafColumns().length;
  const filtered =
    table.state.columnFilters.length > 0 || String(table.state.globalFilter ?? '').trim() !== '';

  function onRowClick(row: TData) {
    if (!rowHref) return undefined;
    return (e: MouseEvent<HTMLTableRowElement>) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      router.push(rowHref(row));
    };
  }

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => {
              const column = header.column;
              const sorted = column.getIsSorted();
              const canSort = column.getCanSort();
              return (
                <TableHead
                  key={header.id}
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  className={columnClass?.[column.id]}
                >
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={column.getToggleSortingHandler()}
                      data-sorted={sorted || undefined}
                      className="inline-flex h-10 items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors duration-150 hover:text-text-secondary data-[sorted]:text-foreground"
                    >
                      {flexRender(column.columnDef.header, header.getContext())}
                      <SortGlyph dir={sorted} />
                    </button>
                  ) : (
                    flexRender(column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colCount} className="py-12">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {emptyLabel}
              </p>
              <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">{emptyBody}</p>
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    table.resetColumnFilters();
                    table.resetGlobalFilter();
                  }}
                  className="mt-4 h-8 rounded-md border border-border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:bg-surface-inset hover:text-foreground"
                >
                  Clear filters
                </button>
              )}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={onRowClick(row.original)}
              className={cn(rowHref && 'cursor-pointer')}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={columnClass?.[cell.column.id]}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function SortGlyph({ dir }: { dir: false | 'asc' | 'desc' }) {
  const Icon = dir === 'asc' ? ChevronUp : dir === 'desc' ? ChevronDown : ChevronsUpDown;
  return <Icon aria-hidden="true" size={14} strokeWidth={1.5} className={cn(!dir && 'opacity-50')} />;
}

/** The search box: drives the table's global filter through `search(row)`. */
export function DataTableSearch<TData extends object>({
  table,
  label,
  placeholder = 'Search',
  className,
}: {
  table: DataTableInstance<TData>;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const value = String(table.state.globalFilter ?? '');
  return (
    <Input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => table.setGlobalFilter(e.target.value)}
      className={cn('max-w-[280px]', className)}
    />
  );
}

export const FACET_ALL = 'all';

export type FacetOption = { value: string; label: string; count?: number };

/**
 * Facet tabs over one column (an `equals` filter). Pass the column's discrete
 * values; an "All" tab is added first. Counts, when given, are pre-filter
 * totals the caller computes from its data.
 */
export function DataTableFacetTabs<TData extends object>({
  table,
  columnId,
  label,
  allLabel = 'All',
  allCount,
  options,
  className,
}: {
  table: DataTableInstance<TData>;
  columnId: string;
  label: string;
  allLabel?: string;
  allCount?: number;
  options: FacetOption[];
  className?: string;
}) {
  const column = table.getColumn(columnId);
  const current = String(column?.getFilterValue() ?? FACET_ALL);
  const all: FacetOption = { value: FACET_ALL, label: allLabel, count: allCount };

  return (
    <Tabs
      value={current}
      onValueChange={(v) => column?.setFilterValue(v === FACET_ALL ? undefined : v)}
      className={className}
    >
      <TabsList aria-label={label}>
        {[all, ...options].map((o) => (
          <TabsTrigger key={o.value} value={o.value}>
            {o.label}
            {o.count !== undefined && (
              <span className="tabular-nums text-text-tertiary">{o.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
