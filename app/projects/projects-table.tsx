'use client';

/**
 * The /projects dashboard list as a sortable, filterable, searchable table
 * (components/ap/data-table.tsx). One row per production; rows link to
 * /projects/[id]. The Status column is the user's own tag (active | pending |
 * done), set right in the row with ProjectStatusSelect, and the thing the
 * facet tabs filter on. The archive control sits in its own column so it
 * never fights the row link.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, CircleHelp } from 'lucide-react';
import { LightWell } from '@/components/ap/light-well';
import { ProjectStatusSelect } from '@/components/ap/project-status-select';
import { Tooltip } from '@/components/ap/tooltip';
import {
  DataTable,
  DataTableFacetTabs,
  DataTableSearch,
  createDataColumns,
  useDataTable,
  type FacetOption,
} from '@/components/ap/data-table';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_RANK,
  type ProjectStatus,
} from '@/lib/project-status';
import { ArchiveButton } from './archive-button';
import type { ProjectRow } from './rows';

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const col = createDataColumns<ProjectRow>();

/** What the Status cell needs from the table: a way to report a pick so the facets re-filter at once. */
type ProjectsTableMeta = { onStatus: (id: string, status: ProjectStatus) => void };

const columns = col.columns([
  col.accessor('name', {
    header: 'Project',
    sortFn: 'text',
    cell: ({ row }) => <ProjectCell row={row.original} />,
  }),
  col.accessor('status', {
    header: 'Status',
    filterFn: 'equals',
    sortFn: (a, b, id) =>
      PROJECT_STATUS_RANK[a.getValue<ProjectStatus>(id)] - PROJECT_STATUS_RANK[b.getValue<ProjectStatus>(id)],
    cell: ({ row, table }) => (
      <ProjectStatusSelect
        projectId={row.original.id}
        value={row.original.status}
        label={`Status for ${row.original.name}`}
        onChange={(status) => (table.options.meta as ProjectsTableMeta | undefined)?.onStatus(row.original.id, status)}
      />
    ),
  }),
  col.accessor('scenes', {
    header: 'Scenes',
    cell: ({ getValue }) => <Count value={getValue()} />,
  }),
  col.accessor('items', {
    header: 'Items',
    cell: ({ getValue }) => <Count value={getValue()} />,
  }),
  col.accessor((r) => r.paperwork.complete, {
    id: 'documents',
    header: 'Documents',
    sortDescFirst: true,
    cell: ({ row }) => <PaperworkMark standing={row.original.paperwork} />,
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

/** Copy for the paperwork mark: the same sentence reaches the tooltip and the mobile line. */
export function paperworkCopy(p: ProjectRow['paperwork']): { label: string; detail: string } {
  if (p.complete) {
    return {
      label: 'Paperwork complete',
      detail: 'Every document on this project’s checklist is attached, on file, or marked not applicable.',
    };
  }
  if (p.outstanding === 0) {
    return {
      label: 'Paperwork needed',
      detail: 'No checklist yet. Describe the production on its paperwork page to see which documents it needs.',
    };
  }
  return {
    label: 'Paperwork needed',
    detail: `${p.outstanding} ${p.outstanding === 1 ? 'document' : 'documents'} on the checklist still need${p.outstanding === 1 ? 's' : ''} to be submitted.`,
  };
}

/**
 * One mark, not a count: a check when the checklist is fully accounted for, a
 * question mark when the production still owes paperwork. The tooltip says
 * which and why.
 */
function PaperworkMark({ standing }: { standing: ProjectRow['paperwork'] }) {
  const { label, detail } = paperworkCopy(standing);
  const Icon = standing.complete ? Check : CircleHelp;
  return (
    <Tooltip label={label} content={detail} side="right">
      <span
        data-complete={standing.complete || undefined}
        className="inline-flex h-6 w-6 items-center justify-center border border-border bg-surface-inset text-status-quoted data-[complete]:text-status-confirmed"
      >
        <Icon size={14} strokeWidth={2} aria-hidden />
      </span>
    </Tooltip>
  );
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
          {row.scenes} sc · {row.items} items · {row.paperwork.complete ? 'paperwork complete' : 'paperwork needed'}
        </p>
      </div>
    </div>
  );
}

const SORT = [{ id: 'updated', desc: true }];

function searchText(r: ProjectRow): string {
  return [r.name, PROJECT_STATUS_LABEL[r.status]].join(' ');
}

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  // Picks the user makes in a row, ahead of the server round-trip, so the
  // facet counts and the active filter follow the pick without a flash. The
  // server render wins once router.refresh() lands new rows.
  const [picks, setPicks] = useState<Record<string, ProjectStatus>>({});
  const rows = useMemo(
    () => projects.map((p) => (picks[p.id] && picks[p.id] !== p.status ? { ...p, status: picks[p.id] } : p)),
    [projects, picks],
  );
  const onStatus = useCallback((id: string, status: ProjectStatus) => {
    setPicks((p) => ({ ...p, [id]: status }));
  }, []);
  // New rows from the server carry the saved statuses; drop the interim picks.
  useEffect(() => {
    setPicks({});
  }, [projects]);
  const meta = useMemo<ProjectsTableMeta>(() => ({ onStatus }), [onStatus]);

  const table = useDataTable({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    initialSorting: SORT,
    search: searchText,
    meta,
  });

  // Every status is a tab, even at zero: the user assigns these, so an empty
  // Done bucket is information, not noise.
  const facets: FacetOption[] = PROJECT_STATUSES.map((s) => ({
    value: s,
    label: PROJECT_STATUS_LABEL[s],
    count: rows.filter((p) => p.status === s).length,
  }));

  return (
    <div>
      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <DataTableFacetTabs
          table={table}
          columnId="status"
          label="Filter projects by status"
          allCount={rows.length}
          options={facets}
          className="min-w-0 flex-1"
        />
        <DataTableSearch table={table} label="Search projects" placeholder="Search projects" />
      </div>
      <div className="-mx-4 border-t border-border sm:-mx-6">
        <DataTable
          table={table}
          rowHref={(r) => `/projects/${r.id}`}
          columnClass={{
            name: 'w-full max-w-0',
            scenes: 'hidden sm:table-cell',
            items: 'hidden sm:table-cell',
            documents: 'hidden md:table-cell',
            updated: 'hidden sm:table-cell',
          }}
          emptyBody="No projects match that filter."
        />
      </div>
    </div>
  );
}
