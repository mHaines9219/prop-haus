'use client';

/**
 * The /jobs board: orders in flight and crew requests as sortable, filterable
 * list tables (components/ap/data-table.tsx). Rows link to /orders/[id]; the
 * status tabs and search box narrow the orders table client-side.
 */

import Link from 'next/link';
import { LightWell } from '@/components/ap/light-well';
import { StatusToken, crewStatusSpec, orderStatusSpec } from '@/components/ap/status-token';
import {
  DataTable,
  DataTableFacetTabs,
  DataTableSearch,
  createDataColumns,
  useDataTable,
  type FacetOption,
} from '@/components/ap/data-table';
import type { OrderStatus } from '@/lib/orders';
import type { CrewRow, JobRow } from './rows';

const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  placed: 0,
  processing: 1,
  confirmed: 2,
  cancelled: 3,
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Placed',
  processing: 'Processing',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

const CREW_STATUS_RANK: Record<CrewRow['status'], number> = { requested: 0, confirmed: 1, declined: 2 };

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Orders ──────────────────────────────────────────────────────────────────

const job = createDataColumns<JobRow>();

const jobColumns = job.columns([
  job.accessor((r) => Date.parse(r.createdAt), {
    id: 'order',
    header: 'Order',
    sortDescFirst: true,
    cell: ({ row }) => <OrderCell row={row.original} />,
  }),
  job.accessor('status', {
    header: 'Status',
    filterFn: 'equals',
    sortFn: (a, b, id) =>
      ORDER_STATUS_RANK[a.getValue<OrderStatus>(id)] - ORDER_STATUS_RANK[b.getValue<OrderStatus>(id)],
    cell: ({ getValue }) => <StatusToken {...orderStatusSpec(getValue())} />,
  }),
  job.accessor('vendors', {
    header: 'Vendors',
    cell: ({ row }) => (
      <div className="font-mono text-[12px] tabular-nums text-text-secondary">
        <p>{row.original.vendors}</p>
        <p className="mt-1 text-[11px] text-text-tertiary">
          {row.original.messagesSent > 0 ? `${row.original.messagesSent} sent` : 'not sent'}
        </p>
      </div>
    ),
  }),
  job.accessor('items', {
    header: 'Items',
    cell: ({ row }) => (
      <div className="font-mono text-[12px] tabular-nums text-text-secondary">
        <p>{row.original.items}</p>
        <p className="mt-1 text-[11px] text-text-tertiary">{row.original.itemsConfirmed} confirmed</p>
      </div>
    ),
  }),
  job.accessor((r) => Date.parse(r.updatedAt), {
    id: 'updated',
    header: 'Updated',
    sortDescFirst: true,
    cell: ({ row }) => (
      <span className="font-mono text-[12px] tabular-nums text-text-tertiary">{formatDate(row.original.updatedAt)}</span>
    ),
  }),
]);

function OrderCell({ row }: { row: JobRow }) {
  return (
    <div className="flex items-center gap-4">
      {/* Filmstrip: three 40px wells overlapping by 8px; empty slots stay visible. */}
      <div className="flex shrink-0 items-center">
        {[0, 1, 2].map((i) => {
          const t = row.thumbs[i];
          return (
            <div
              key={t ? t.id : `empty-${i}`}
              className="h-10 w-10 overflow-hidden border border-border bg-surface-inset"
              style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }}
            >
              {t && <LightWell src={t.image} alt={t.name} mode="photo" fill />}
            </div>
          );
        })}
      </div>
      <div className="min-w-0">
        <Link
          href={`/orders/${row.id}`}
          className="block truncate text-[15px] font-medium leading-[22px] text-foreground"
        >
          Order #{row.code}
        </Link>
        <p className="mt-0.5 truncate font-mono text-[12px] leading-[16px] text-text-tertiary">{row.rollup}</p>
      </div>
    </div>
  );
}

function jobSearchText(r: JobRow): string {
  return [r.code, r.status, r.rollup, ...r.vendorNames].join(' ');
}

const JOB_SORT = [{ id: 'updated', desc: true }];

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const table = useDataTable({
    data: jobs,
    columns: jobColumns,
    getRowId: (r) => r.id,
    initialSorting: JOB_SORT,
    search: jobSearchText,
  });

  const facets: FacetOption[] = (Object.keys(ORDER_STATUS_LABEL) as OrderStatus[])
    .map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], count: jobs.filter((j) => j.status === s).length }))
    .filter((o) => o.count > 0);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <DataTableFacetTabs
          table={table}
          columnId="status"
          label="Filter orders by status"
          allCount={jobs.length}
          options={facets}
          className="min-w-0 flex-1"
        />
        <DataTableSearch table={table} label="Search orders" placeholder="Search orders or vendors" />
      </div>
      <div className="mt-4 -mx-4 border-t border-border sm:-mx-6">
        <DataTable
          table={table}
          rowHref={(r) => `/orders/${r.id}`}
          columnClass={{ vendors: 'hidden md:table-cell', items: 'hidden sm:table-cell' }}
          emptyBody="No orders match that filter."
        />
      </div>
    </div>
  );
}

// ── Crew ────────────────────────────────────────────────────────────────────

const crew = createDataColumns<CrewRow>();

const crewColumns = crew.columns([
  crew.accessor('contractorName', {
    header: 'Contractor',
    sortFn: 'text',
    cell: ({ row }) => (
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 shrink-0 overflow-hidden border border-border bg-surface-inset">
          <LightWell
            src={row.original.contractorPhoto ?? undefined}
            alt={row.original.contractorName}
            mode="photo"
            fill
            name={row.original.contractorName}
          />
        </div>
        <p className="truncate text-[15px] font-medium leading-[22px] text-foreground">
          {row.original.contractorName}
        </p>
      </div>
    ),
  }),
  crew.accessor('status', {
    header: 'Status',
    sortFn: (a, b, id) =>
      CREW_STATUS_RANK[a.getValue<CrewRow['status']>(id)] - CREW_STATUS_RANK[b.getValue<CrewRow['status']>(id)],
    cell: ({ getValue }) => <StatusToken {...crewStatusSpec(getValue())} />,
  }),
  crew.accessor((r) => r.requestedDates[0] ?? '', {
    id: 'dates',
    header: 'Dates',
    sortFn: 'text',
    cell: ({ row }) => (
      <span className="font-mono text-[12px] tabular-nums text-text-secondary">
        {row.original.requestedDates.length > 0
          ? row.original.requestedDates.map(formatDate).join(', ')
          : 'Dates on request'}
      </span>
    ),
  }),
  crew.accessor((r) => r.location ?? '', {
    id: 'location',
    header: 'Location',
    sortFn: 'text',
    cell: ({ row }) => (
      <span className="font-mono text-[12px] text-text-secondary">{row.original.location ?? ''}</span>
    ),
  }),
  crew.accessor((r) => Date.parse(r.createdAt), {
    id: 'requested',
    header: 'Requested',
    sortDescFirst: true,
    cell: ({ row }) => (
      <span className="font-mono text-[12px] tabular-nums text-text-tertiary">{formatDate(row.original.createdAt)}</span>
    ),
  }),
]);

function crewSearchText(r: CrewRow): string {
  return [r.contractorName, r.status, r.location ?? ''].join(' ');
}

const CREW_SORT = [{ id: 'requested', desc: true }];

export function CrewTable({ crew: requests }: { crew: CrewRow[] }) {
  const table = useDataTable({
    data: requests,
    columns: crewColumns,
    getRowId: (r) => r.id,
    initialSorting: CREW_SORT,
    search: crewSearchText,
  });

  return (
    <div>
      <div className="flex justify-end">
        <DataTableSearch table={table} label="Search crew" placeholder="Search crew" />
      </div>
      <div className="mt-4 -mx-4 border-t border-border sm:-mx-6">
        <DataTable
          table={table}
          columnClass={{ location: 'hidden md:table-cell', requested: 'hidden sm:table-cell' }}
          emptyBody="No crew requests match that search."
        />
      </div>
    </div>
  );
}
