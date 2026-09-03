'use client';

/**
 * The /projects dashboard list as a sortable, searchable table
 * (components/ap/data-table.tsx). One row per production; rows link to
 * /projects/[id]. The archive control sits in its own column so it never
 * fights the row link.
 */

import Link from 'next/link';
import { LightWell } from '@/components/ap/light-well';
import {
  DataTable,
  DataTableSearch,
  createDataColumns,
  useDataTable,
} from '@/components/ap/data-table';
import { ArchiveButton } from './archive-button';
import type { ProjectRow } from './rows';

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const col = createDataColumns<ProjectRow>();

const columns = col.columns([
  col.accessor('name', {
    header: 'Project',
    sortFn: 'text',
    cell: ({ row }) => <ProjectCell row={row.original} />,
  }),
  col.accessor('scenes', {
    header: 'Scenes',
    cell: ({ getValue }) => <Count value={getValue()} />,
  }),
  col.accessor('items', {
    header: 'Items',
    cell: ({ getValue }) => <Count value={getValue()} />,
  }),
  col.accessor('documents', {
    header: 'Documents',
    cell: ({ getValue }) => <Count value={getValue()} />,
  }),
  col.accessor((r) => Date.parse(r.updatedAt), {
    id: 'updated',
    header: 'Updated',
    sortDescFirst: true,
    cell: ({ row }) => (
      <span className="font-mono text-[11px] leading-[14px] tabular-nums text-text-tertiary">
        {formatDate(row.original.updatedAt)}
      </span>
    ),
  }),
  col.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-3">
        {row.original.archivedAt && (
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
            Archived
          </span>
        )}
        <ArchiveButton projectId={row.original.id} isArchived={Boolean(row.original.archivedAt)} />
      </div>
    ),
  }),
]);

function Count({ value }: { value: number }) {
  return <span className="font-mono text-[12px] tabular-nums text-text-secondary">{value}</span>;
}

function ProjectCell({ row }: { row: ProjectRow }) {
  return (
    <div className="flex items-center gap-4">
      {/* Filmstrip: three 40px wells overlapping by 8px; empty slots stay visible so a new project looks deliberate. */}
      <div className="flex shrink-0 items-center">
        {[0, 1, 2].map((i) => {
          const t = row.thumbs[i];
          return (
            <div
              key={t ? t.itemId : `empty-${i}`}
              className="h-10 w-10 overflow-hidden border border-border bg-surface-inset"
              style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }}
            >
              {t && <LightWell src={t.image} alt={t.name} fill />}
            </div>
          );
        })}
      </div>
      <div className="min-w-0">
        <Link
          href={`/projects/${row.id}`}
          className="block truncate text-[15px] font-medium leading-[22px] text-foreground"
        >
          {row.name}
        </Link>
        <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary sm:hidden">
          {row.scenes} sc · {row.items} items · {row.documents} docs
        </p>
      </div>
    </div>
  );
}

const SORT = [{ id: 'updated', desc: true }];

function searchText(r: ProjectRow): string {
  return r.name;
}

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const table = useDataTable({
    data: projects,
    columns,
    getRowId: (r) => r.id,
    initialSorting: SORT,
    search: searchText,
  });

  return (
    <div>
      <div className="flex justify-end py-4">
        <DataTableSearch table={table} label="Search projects" placeholder="Search projects" />
      </div>
      <div className="-mx-4 border-t border-border sm:-mx-6">
        <DataTable
          table={table}
          rowHref={(r) => `/projects/${r.id}`}
          columnClass={{
            scenes: 'hidden sm:table-cell',
            items: 'hidden sm:table-cell',
            documents: 'hidden md:table-cell',
            updated: 'hidden sm:table-cell',
          }}
          emptyBody="No projects match that search."
        />
      </div>
    </div>
  );
}
