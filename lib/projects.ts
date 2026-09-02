import crypto from 'node:crypto';
import { z } from 'zod';
import { CLIP_SOURCE, SOURCES, type ClipMeta, type SavedSource } from './types';
import { isSafeExternalUrl } from './safe-url';
import { PROJECT_SELECT, db, toProject, toProjectFolder } from './projects-db';
import {
  PAPERWORK_SIGNED_URL_SECONDS,
  checkPaperworkFile,
  paperworkBucket,
} from './paperwork';
import type { ProjectProfile } from './project-profile';

/**
 * A project is a production. It owns folders:
 *
 *   - any number of SCENE folders ("Sc. 12 diner", "Apt interior"), each a
 *     named collection of catalog items and web clips the org has pulled while
 *     browsing, so a set decorator can sort a production's pulls by scene;
 *   - exactly one PAPERWORK folder, holding uploaded documents (COIs, W9s,
 *     invoices, call sheets) in a private storage bucket.
 *
 * Before 20260902120000_project_folders.sql a project WAS a single flat folder.
 * The item-level helpers that took a project id still exist (see
 * addItemsToProject / removeItemFromProject) and default to the first scene
 * folder, so older callers — and the FUT-3 browser extension contract — keep
 * working.
 */
export type Project = {
  id: string;
  /** Owning organization. Server-assigned from the session — never accepted from a client. */
  orgId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Soft-hidden from the project list when set. */
  archivedAt?: string;
  /** What intake has learned about the production (lib/project-profile.ts). Empty until described. */
  profile: ProjectProfile;
  /** Scene folders in display order, then the paperwork folder. */
  folders: ProjectFolder[];
};

export type FolderKind = 'scene' | 'paperwork';
export const FOLDER_KINDS = ['scene', 'paperwork'] as const satisfies readonly FolderKind[];

export type ProjectFolder = {
  id: string;
  projectId: string;
  name: string;
  kind: FolderKind;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Saved items. Always empty for a paperwork folder. */
  items: ProjectItem[];
  /** Uploaded documents. Always empty for a scene folder. */
  documents: ProjectDocument[];
};

/** A catalog item saved into a scene folder. Snapshotted so a folder survives the item being de-listed. */
export type ProjectItem = {
  itemId: string;
  source: SavedSource;
  sourceId: string;
  name: string;
  image?: string;
  sourceUrl: string;
  category?: string;
  /** Web-clip extras (retailer/price/description). Absent for catalog items. */
  meta?: ClipMeta;
  addedAt: string;
};

export type ProjectItemInput = Omit<ProjectItem, 'addedAt'>;

/** A file uploaded into a project's paperwork folder. Bytes live in storage at `storagePath`. */
export type ProjectDocument = {
  id: string;
  folderId: string;
  name: string;
  /** Object key in the paperwork bucket. Server-side only; never render it. */
  storagePath: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
};

/** Name given to the scene folder every new project starts with. */
export const DEFAULT_SCENE_FOLDER_NAME = 'Scene 1';
/** Name of the one paperwork folder every project has. */
export const PAPERWORK_FOLDER_NAME = 'Paperwork';

/** Folder names are user-chosen and rendered as text; bound them like project names. */
export const FolderNameSchema = z.string().trim().min(1).max(120);

// ── aggregate helpers ────────────────────────────────────────────────────────

export function sceneFolders(p: Project): ProjectFolder[] {
  return p.folders.filter((f) => f.kind === 'scene');
}

export function paperworkFolder(p: Project): ProjectFolder | undefined {
  return p.folders.find((f) => f.kind === 'paperwork');
}

export function findFolder(p: Project, folderId: string): ProjectFolder | undefined {
  return p.folders.find((f) => f.id === folderId);
}

/** Every saved item across a project's scene folders, newest first. */
export function allItems(p: Project): ProjectItem[] {
  return p.folders
    .flatMap((f) => f.items)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function projectItemCount(p: Project): number {
  return p.folders.reduce((n, f) => n + f.items.length, 0);
}

export function projectDocumentCount(p: Project): number {
  return p.folders.reduce((n, f) => n + f.documents.length, 0);
}

/**
 * The scene folder items land in when a caller names none: the first in
 * display order. Undefined only when every scene folder has been deleted.
 */
export function defaultSceneFolder(p: Project): ProjectFolder | undefined {
  return sceneFolders(p)[0];
}

/**
 * Runtime validation for a snapshot arriving from a client — the folder-item
 * POST routes cast the body with no checks otherwise, and one of the writers is
 * now the web clipper (MVP-7), which turns arbitrary retailer HTML into these.
 *
 * `image`/`sourceUrl` must survive `isSafeExternalUrl` (http/https only, no
 * `javascript:`) because the folder page renders them as an <img src> and an
 * <a href>. Lengths are capped so a hostile listing can't write a novel into a
 * row.
 */
const safeHttpUrl = z
  .string()
  .refine(isSafeExternalUrl, 'must be an http(s) URL');

const ClipMetaSchema = z
  .object({
    retailer: z.string().max(200).optional(),
    price: z
      .object({ amount: z.number().finite(), currency: z.string().max(8) })
      .optional(),
    description: z.string().max(4000).optional(),
  })
  .strict();

export const ProjectItemInputSchema = z.object({
  itemId: z.string().min(1).max(512),
  source: z.union([z.enum(SOURCES), z.literal(CLIP_SOURCE)]),
  sourceId: z.string().min(1).max(2048),
  name: z.string().min(1).max(300),
  image: safeHttpUrl.optional(),
  sourceUrl: safeHttpUrl,
  category: z.string().max(120).optional(),
  meta: ClipMetaSchema.optional(),
});

// Compile-time guard: the schema's output must be assignable to the hand-written
// ProjectItemInput (and vice versa), so the two can't drift apart silently.
type _SchemaMatchesInput = z.infer<typeof ProjectItemInputSchema> extends ProjectItemInput
  ? ProjectItemInput extends z.infer<typeof ProjectItemInputSchema>
    ? true
    : never
  : never;
const _schemaMatches: _SchemaMatchesInput = true;
void _schemaMatches;

/** Backed by Postgres (public.projects / project_folders / project_items / project_documents). Row mapping lives in lib/projects-db.ts. */

/** Throw rather than return empty: a read failure is not an absence of projects. */
function orThrow<T>(what: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
}

// ── projects ─────────────────────────────────────────────────────────────────

/**
 * One organization's projects, newest first. Archived projects are hidden unless asked for.
 *
 * Scoped by org rather than filtered by the caller, so a missing `where` clause
 * cannot leak another org's projects into a list view.
 */
export async function listProjects(
  orgId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Project[]> {
  let q = db().from('projects').select(PROJECT_SELECT).eq('org_id', orgId);
  if (!opts.includeArchived) q = q.is('archived_at', null);

  const rows = orThrow('listProjects', await q.order('created_at', { ascending: false }));
  return rows.map(toProject);
}

/**
 * One project, for a member of the owning organization. Returns undefined for
 * "does not exist" and for "not yours" alike; the caller cannot tell them apart.
 */
export async function getProject(orgId: string, id: string): Promise<Project | undefined> {
  const { data, error } = await db()
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`getProject: ${error.message}`);
  return data ? toProject(data) : undefined;
}

/**
 * Create a project with its two starting folders — "Scene 1" and "Paperwork" —
 * optionally seeding the scene folder with items.
 *
 * `orgId` comes from the session (lib/session.ts), never from the request body.
 */
export async function createProject(
  orgId: string,
  name: string,
  items: ProjectItemInput[] = [],
  opts: { sceneName?: string } = {},
): Promise<Project> {
  const id = crypto.randomBytes(16).toString('hex');
  const client = db();

  orThrow(
    'createProject',
    await client.from('projects').insert({ id, org_id: orgId, name }).select('id'),
  );

  const folders = orThrow<{ id: string; kind: FolderKind }[]>(
    'createProject folders',
    await client
      .from('project_folders')
      .insert([
        { project_id: id, name: opts.sceneName ?? DEFAULT_SCENE_FOLDER_NAME, kind: 'scene', position: 0 },
        { project_id: id, name: PAPERWORK_FOLDER_NAME, kind: 'paperwork', position: 0 },
      ])
      .select('id, kind'),
  );

  if (items.length > 0) {
    const scene = folders.find((f) => f.kind === 'scene');
    if (!scene) throw new Error('createProject: scene folder vanished immediately after insert');
    orThrow(
      'createProject items',
      await client
        .from('project_items')
        .insert(items.map((item) => toItemRow(id, scene.id, item)))
        .select('id'),
    );
  }

  const created = await getProject(orgId, id);
  if (!created) throw new Error('createProject: row vanished immediately after insert');
  return created;
}

/**
 * Archive or restore a project. Scoped by org so one org cannot archive another's.
 * Returns null when the project does not exist OR is not theirs.
 */
export async function setProjectArchived(
  orgId: string,
  id: string,
  archived: boolean,
): Promise<Project | null> {
  const updated = orThrow<{ id: string }[]>(
    'setProjectArchived',
    await db()
      .from('projects')
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id'),
  );
  if (updated.length === 0) return null;
  return (await getProject(orgId, id)) ?? null;
}

// ── folders ──────────────────────────────────────────────────────────────────

/** True when `projectId` exists and belongs to `orgId`. The gate every write passes. */
async function ownsProject(orgId: string, projectId: string): Promise<boolean> {
  const owned = orThrow<{ id: string }[]>(
    'ownsProject',
    await db().from('projects').select('id').eq('id', projectId).eq('org_id', orgId),
  );
  return owned.length > 0;
}

type OwnedFolder = { id: string; kind: FolderKind };

/**
 * The folder, if it belongs to a project the org owns. Two hops on purpose: the
 * org check and the folder-in-project check are both access control, and
 * keeping them as plain equality filters makes that reviewable.
 */
async function ownedFolder(
  orgId: string,
  projectId: string,
  folderId: string,
): Promise<OwnedFolder | null> {
  if (!(await ownsProject(orgId, projectId))) return null;
  const rows = orThrow<OwnedFolder[]>(
    'ownedFolder',
    await db()
      .from('project_folders')
      .select('id, kind')
      .eq('id', folderId)
      .eq('project_id', projectId),
  );
  return rows[0] ?? null;
}

/**
 * Add a scene folder to a project. Appends after the existing scenes.
 * Returns null when the project does not exist or is not the caller's.
 */
export async function createFolder(
  orgId: string,
  projectId: string,
  name: string,
): Promise<ProjectFolder | null> {
  if (!(await ownsProject(orgId, projectId))) return null;

  const last = orThrow<{ position: number }[]>(
    'createFolder.position',
    await db()
      .from('project_folders')
      .select('position')
      .eq('project_id', projectId)
      .eq('kind', 'scene')
      .order('position', { ascending: false })
      .limit(1),
  );
  const position = last.length > 0 ? last[0].position + 1 : 0;

  const inserted = orThrow<{ id: string }[]>(
    'createFolder',
    await db()
      .from('project_folders')
      .insert({ project_id: projectId, name, kind: 'scene', position })
      .select('id'),
  );
  await touchProject(projectId);

  const rows = orThrow(
    'createFolder.read',
    await db()
      .from('project_folders')
      .select('*, project_items(*), project_documents(*)')
      .eq('id', inserted[0].id),
  );
  return rows[0] ? toProjectFolder(rows[0]) : null;
}

/**
 * Rename a folder (scene or paperwork — the kind is what the UI keys on, not
 * the name). Returns null when the folder isn't the caller's.
 */
export async function renameFolder(
  orgId: string,
  projectId: string,
  folderId: string,
  name: string,
): Promise<Project | null> {
  const folder = await ownedFolder(orgId, projectId, folderId);
  if (!folder) return null;

  orThrow(
    'renameFolder',
    await db()
      .from('project_folders')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', folderId)
      .select('id'),
  );
  await touchProject(projectId);
  return (await getProject(orgId, projectId)) ?? null;
}

export type DeleteFolderResult = 'deleted' | 'not-found' | 'paperwork';

/**
 * Delete a scene folder and everything saved in it. The paperwork folder can't
 * be deleted — there is exactly one per project and the schema depends on it.
 */
export async function deleteFolder(
  orgId: string,
  projectId: string,
  folderId: string,
): Promise<DeleteFolderResult> {
  const folder = await ownedFolder(orgId, projectId, folderId);
  if (!folder) return 'not-found';
  if (folder.kind === 'paperwork') return 'paperwork';

  orThrow(
    'deleteFolder',
    await db().from('project_folders').delete().eq('id', folderId).select('id'),
  );
  await touchProject(projectId);
  return 'deleted';
}

// ── items ────────────────────────────────────────────────────────────────────

/**
 * Save items into a scene folder. Re-saving an item already in the folder is a
 * no-op for that item (unique (folder_id, item_id) — upsert ignores it).
 * Returns null when the folder does not exist, is not the caller's, or is the
 * paperwork folder (items never live there).
 */
export async function addItemsToFolder(
  orgId: string,
  projectId: string,
  folderId: string,
  items: ProjectItemInput[],
): Promise<Project | null> {
  const folder = await ownedFolder(orgId, projectId, folderId);
  if (!folder || folder.kind !== 'scene') return null;

  if (items.length > 0) {
    orThrow(
      'addItemsToFolder',
      await db()
        .from('project_items')
        .upsert(
          items.map((item) => toItemRow(projectId, folderId, item)),
          { onConflict: 'folder_id,item_id', ignoreDuplicates: true },
        )
        .select('id'),
    );
    await touchProject(projectId);
  }

  return (await getProject(orgId, projectId)) ?? null;
}

/** Remove one saved item from a scene folder. Returns null when the folder isn't the caller's. */
export async function removeItemFromFolder(
  orgId: string,
  projectId: string,
  folderId: string,
  itemId: string,
): Promise<Project | null> {
  const folder = await ownedFolder(orgId, projectId, folderId);
  if (!folder) return null;

  await db()
    .from('project_items')
    .delete()
    .eq('project_id', projectId)
    .eq('folder_id', folderId)
    .eq('item_id', itemId);
  await touchProject(projectId);

  return (await getProject(orgId, projectId)) ?? null;
}

/**
 * Save items into a project without naming a folder: they land in the first
 * scene folder, which is created if every scene folder has been deleted.
 * Kept for callers that predate folders (the /api/projects/[id]/items route
 * and the FUT-3 extension contract). Returns null when the project isn't the caller's.
 */
export async function addItemsToProject(
  orgId: string,
  projectId: string,
  items: ProjectItemInput[],
): Promise<Project | null> {
  const project = await getProject(orgId, projectId);
  if (!project) return null;

  let target = defaultSceneFolder(project);
  if (!target) {
    const created = await createFolder(orgId, projectId, DEFAULT_SCENE_FOLDER_NAME);
    if (!created) return null;
    target = created;
  }
  return addItemsToFolder(orgId, projectId, target.id, items);
}

/**
 * Remove an item from every scene folder in the project — the pre-folders
 * semantics of "remove this from the project". Returns null when the project
 * isn't the caller's.
 */
export async function removeItemFromProject(
  orgId: string,
  projectId: string,
  itemId: string,
): Promise<Project | null> {
  if (!(await ownsProject(orgId, projectId))) return null;

  await db().from('project_items').delete().eq('project_id', projectId).eq('item_id', itemId);
  await touchProject(projectId);

  return (await getProject(orgId, projectId)) ?? null;
}

// ── documents (paperwork) ────────────────────────────────────────────────────

export type AddDocumentResult =
  | { ok: true; document: ProjectDocument }
  | { ok: false; status: 404 | 400 | 500; error: string };

/**
 * Upload a file into a project's paperwork folder: validate → store the bytes
 * under an id-keyed object path (org/project/doc.ext, so storage RLS can scope
 * by org) → record the row. A failed insert removes the object again so the
 * bucket can't accumulate orphans.
 */
export async function addDocument(
  orgId: string,
  projectId: string,
  folderId: string,
  file: { name: string; mime: string; bytes: Uint8Array },
): Promise<AddDocumentResult> {
  const folder = await ownedFolder(orgId, projectId, folderId);
  if (!folder || folder.kind !== 'paperwork') {
    return { ok: false, status: 404, error: 'not found' };
  }

  const check = checkPaperworkFile({ name: file.name, mime: file.mime, size: file.bytes.byteLength });
  if (!check.ok) return { ok: false, status: 400, error: check.reason };

  const id = crypto.randomUUID();
  const storagePath = `${orgId}/${projectId}/${id}.${check.ext}`;
  const client = db();
  const bucket = client.storage.from(paperworkBucket());

  const up = await bucket.upload(storagePath, file.bytes, {
    contentType: check.mime,
    upsert: false,
  });
  if (up.error) return { ok: false, status: 500, error: `upload failed: ${up.error.message}` };

  const ins = await client
    .from('project_documents')
    .insert({
      id,
      project_id: projectId,
      folder_id: folderId,
      name: check.name,
      storage_path: storagePath,
      mime: check.mime,
      size_bytes: file.bytes.byteLength,
    })
    .select('*');
  if (ins.error || !ins.data?.[0]) {
    await bucket.remove([storagePath]);
    return { ok: false, status: 500, error: `record failed: ${ins.error?.message ?? 'no row'}` };
  }
  await touchProject(projectId);

  const r = ins.data[0];
  return {
    ok: true,
    document: {
      id: r.id,
      folderId: r.folder_id,
      name: r.name,
      storagePath: r.storage_path,
      mime: r.mime,
      sizeBytes: Number(r.size_bytes),
      uploadedAt: r.uploaded_at,
    },
  };
}

/** Delete a document's row and its bytes. Returns null when the project isn't the caller's or the document is unknown. */
export async function removeDocument(
  orgId: string,
  projectId: string,
  documentId: string,
): Promise<Project | null> {
  if (!(await ownsProject(orgId, projectId))) return null;

  const rows = orThrow<{ id: string; storage_path: string }[]>(
    'removeDocument.read',
    await db()
      .from('project_documents')
      .select('id, storage_path')
      .eq('id', documentId)
      .eq('project_id', projectId),
  );
  const doc = rows[0];
  if (!doc) return null;

  // Row first: a dangling object is harmless, a dangling row would 404 on download.
  await db().from('project_documents').delete().eq('id', doc.id);
  await db().storage.from(paperworkBucket()).remove([doc.storage_path]);
  await touchProject(projectId);

  return (await getProject(orgId, projectId)) ?? null;
}

/**
 * A short-lived signed download URL for a document, or null when the project
 * isn't the caller's or the document is unknown. The bucket is private; this is
 * the only way bytes leave it.
 */
export async function documentDownloadUrl(
  orgId: string,
  projectId: string,
  documentId: string,
): Promise<{ url: string; name: string } | null> {
  if (!(await ownsProject(orgId, projectId))) return null;

  const rows = orThrow<{ storage_path: string; name: string }[]>(
    'documentDownloadUrl.read',
    await db()
      .from('project_documents')
      .select('storage_path, name')
      .eq('id', documentId)
      .eq('project_id', projectId),
  );
  const doc = rows[0];
  if (!doc) return null;

  const { data, error } = await db()
    .storage.from(paperworkBucket())
    .createSignedUrl(doc.storage_path, PAPERWORK_SIGNED_URL_SECONDS, { download: doc.name });
  if (error || !data?.signedUrl) {
    throw new Error(`documentDownloadUrl: ${error?.message ?? 'no url'}`);
  }
  return { url: data.signedUrl, name: doc.name };
}

// ── rows ─────────────────────────────────────────────────────────────────────

/** Bump updated_at so the project list can sort/annotate by recent activity. Best-effort. */
async function touchProject(projectId: string): Promise<void> {
  await db()
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

function toItemRow(projectId: string, folderId: string, item: ProjectItemInput) {
  return {
    project_id: projectId,
    folder_id: folderId,
    item_id: item.itemId,
    source: item.source,
    source_id: item.sourceId,
    name: item.name,
    image: item.image ?? null,
    source_url: item.sourceUrl,
    category: item.category ?? null,
    // Clip extras land in the existing `metadata` jsonb; catalog items store {}.
    metadata: item.meta ?? {},
  };
}
