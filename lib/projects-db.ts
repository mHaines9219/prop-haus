import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import type { ClipMeta, SavedSource } from './types';
import type { FolderKind, Project, ProjectDocument, ProjectFolder, ProjectItem } from './projects';
import { normalizeProjectProfile } from './project-profile';

/**
 * Row <-> object mapping for the projects schema, kept apart from the
 * behaviour in lib/projects.ts so the query shapes are reviewable on their own.
 *
 * Shape (20260902120000_project_folders.sql):
 *   projects ─< project_folders ─< project_items      (kind = 'scene')
 *                               └< project_documents  (kind = 'paperwork')
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

type ProjectDocumentRow = {
  id: string;
  folder_id: string;
  name: string;
  storage_path: string;
  mime: string;
  size_bytes: number | string;
  uploaded_at: string;
};

type ProjectFolderRow = {
  id: string;
  project_id: string;
  name: string;
  kind: FolderKind;
  position: number;
  created_at: string;
  updated_at: string;
  project_items: ProjectItemRow[] | null;
  project_documents: ProjectDocumentRow[] | null;
};

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  profile?: unknown;
  project_folders: ProjectFolderRow[] | null;
};

/** The whole aggregate in one round trip. */
export const PROJECT_SELECT = '*, project_folders(*, project_items(*), project_documents(*))';

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

function toProjectDocument(r: ProjectDocumentRow): ProjectDocument {
  return {
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    storagePath: r.storage_path,
    mime: r.mime,
    // bigint arrives as a string through PostgREST.
    sizeBytes: Number(r.size_bytes),
    uploadedAt: r.uploaded_at,
  };
}

export function toProjectFolder(r: ProjectFolderRow): ProjectFolder {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    kind: r.kind,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Newest-saved first — the order a folder's contents are most useful to review in.
    items: (r.project_items ?? [])
      .map(toProjectItem)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    documents: (r.project_documents ?? [])
      .map(toProjectDocument)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
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
    profile: normalizeProjectProfile(r.profile),
    // Scene folders in their display order, paperwork last.
    folders: (r.project_folders ?? []).map(toProjectFolder).sort(compareFolders),
  };
}

function compareFolders(a: ProjectFolder, b: ProjectFolder): number {
  if (a.kind !== b.kind) return a.kind === 'paperwork' ? 1 : -1;
  if (a.position !== b.position) return a.position - b.position;
  return a.createdAt.localeCompare(b.createdAt);
}

export type Db = SupabaseClient;

/** Service-role client. See the header for why this path cannot use RLS. */
export function db(): Db {
  return createAdminClient();
}

export type { ProjectItemRow, ProjectFolderRow, ProjectDocumentRow, ProjectRow };
