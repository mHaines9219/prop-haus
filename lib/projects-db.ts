import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import type { ClipMeta, SavedSource } from './types';
import type { Project, ProjectItem } from './projects';

/**
 * Row <-> object mapping for the folders schema, kept apart from the
 * behaviour in lib/projects.ts so the query shapes are reviewable on their own.
 *
 * All writes are server-only (service role) — see
 * 20260829130000_strip_workflow_to_folders.sql. `org_id` filters in
 * lib/projects.ts are the access control on this path, not a convenience.
 */

type ProjectItemRow = {
  item_id: string;
  source: SavedSource;
  source_id: string;
  name: string;
  image: string | null;
  source_url: string;
  category: string | null;
  metadata: ClipMeta | null;
  added_at: string;
};

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  project_items: ProjectItemRow[] | null;
};

/** The whole aggregate in one round trip. */
export const PROJECT_SELECT = '*, project_items(*)';

function toProjectItem(r: ProjectItemRow): ProjectItem {
  // `metadata` defaults to {} for catalog items; surface it as `meta` only when
  // a clip actually put something there, so ProjectItem.meta reads as absent.
  const meta = r.metadata && Object.keys(r.metadata).length > 0 ? r.metadata : undefined;
  return {
    itemId: r.item_id,
    source: r.source,
    sourceId: r.source_id,
    name: r.name,
    ...(r.image ? { image: r.image } : {}),
    sourceUrl: r.source_url,
    ...(r.category ? { category: r.category } : {}),
    ...(meta ? { meta } : {}),
    addedAt: r.added_at,
  };
}

export function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.archived_at ? { archivedAt: r.archived_at } : {}),
    // Newest-saved first — the order a folder's contents are most useful to review in.
    items: (r.project_items ?? [])
      .map(toProjectItem)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
  };
}

export type Db = SupabaseClient;

/** Service-role client. See the header for why this path cannot use RLS. */
export function db(): Db {
  return createAdminClient();
}

export type { ProjectItemRow, ProjectRow };
