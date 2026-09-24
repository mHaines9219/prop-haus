'use client';

/**
 * A project's JOBS section: its orders in flight as a sortable, filterable
 * list table (components/ap/data-table.tsx). Rows link to /orders/[id]; the
 * status tabs and search box narrow the table client-side.
 *
 * Two status axes per order row. "Status" is the user's own (active | pending |
 * done), set right in the row with JobStatusSelect and the thing the facet
 * tabs filter on. "Confirmation" is the vendor-driven lifecycle (placed →
 * processing → confirmed), read-only here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LightWell } from '@/components/ap/light-well';
import { JobStatusSelect } from '@/components/ap/job-status-select';
import { StatusToken, orderStatusSpec } from '@/components/ap/status-token';
import {
  DataTable,
  DataTableFacetTabs,
  DataTableSearch,
  createDataColumns,
  useDataTable,
  type FacetOption,
} from '@/components/ap/data-table';
import { JOB_STATUSES, JOB_STATUS_LABEL, JOB_STATUS_RANK, type JobStatus } from '@/lib/job-status';
import type { OrderStatus } from '@/lib/orders';
import type { JobRow } from './job-rows';

const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  placed: 0,
  processing: 1,
  confirmed: 2,
  cancelled: 3,
};

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const job = createDataColumns<JobRow>();

/** What the Status cell needs from the table: a way to report a pick so the facets re-filter at once. */
type JobsTableMeta = { onJobStatus: (id: string, status: JobStatus) => void };

const jobColumns = job.columns([
  job.accessor((r) => Date.parse(r.createdAt), {
    id: 'order',
    header: 'Order',
    sortDescFirst: true,
    cell: ({ row }) => <OrderCell row={row.original} />,
  }),
  job.accessor('jobStatus', {
    header: 'Status',
    filterFn: 'equals',
    sortFn: (a, b, id) => JOB_STATUS_RANK[a.getValue<JobStatus>(id)] - JOB_STATUS_RANK[b.getValue<JobStatus>(id)],
    cell: ({ row, table }) => (
      <JobStatusSelect
        orderId={row.original.id}
        value={row.original.jobStatus}
        label={`Status for order #${row.original.code}`}
        onChange={(status) => (table.options.meta as JobsTableMeta | undefined)?.onJobStatus(row.original.id, status)}
      />
    ),
  }),
  job.accessor('status', {
    header: 'Confirmation',
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
  return [r.code, JOB_STATUS_LABEL[r.jobStatus], r.status, r.rollup, ...r.vendorNames].join(' ');
}

const JOB_SORT = [{ id: 'updated', desc: true }];

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  // Picks the user makes in a row, ahead of the server round-trip, so the
  // facet counts and the active filter follow the pick without a flash. The
  // server render wins once router.refresh() lands new rows.
  const [picks, setPicks] = useState<Record<string, JobStatus>>({});
  const rows = useMemo(
    () => jobs.map((j) => (picks[j.id] && picks[j.id] !== j.jobStatus ? { ...j, jobStatus: picks[j.id] } : j)),
    [jobs, picks],
  );
  const onJobStatus = useCallback((id: string, status: JobStatus) => {
    setPicks((p) => ({ ...p, [id]: status }));
  }, []);
  // New rows from the server carry the saved statuses; drop the interim picks.
  useEffect(() => {
    setPicks({});
  }, [jobs]);
  const meta = useMemo<JobsTableMeta>(() => ({ onJobStatus }), [onJobStatus]);

  const table = useDataTable({
    data: rows,
    columns: jobColumns,
    getRowId: (r) => r.id,
    initialSorting: JOB_SORT,
    search: jobSearchText,
    meta,
  });

  // Every status is a tab, even at zero: the user assigns these, so an empty
  // Done bucket is information, not noise.
  const facets: FacetOption[] = JOB_STATUSES.map((s) => ({
    value: s,
    label: JOB_STATUS_LABEL[s],
    count: rows.filter((j) => j.jobStatus === s).length,
  }));

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <DataTableFacetTabs
          table={table}
          columnId="jobStatus"
          label="Filter orders by status"
          allCount={rows.length}
          options={facets}
          className="min-w-0 flex-1"
        />
        <DataTableSearch table={table} label="Search orders" placeholder="Search orders or vendors" />
      </div>
      <div className="mt-4 -mx-4 border-t border-border sm:-mx-6">
        <DataTable
          table={table}
          rowHref={(r) => `/orders/${r.id}`}
          columnClass={{
            order: 'w-full max-w-0',
            status: 'hidden sm:table-cell',
            vendors: 'hidden md:table-cell',
            items: 'hidden sm:table-cell',
            updated: 'hidden sm:table-cell',
          }}
          emptyBody="No orders match that filter."
        />
      </div>
    </div>
  );
}
