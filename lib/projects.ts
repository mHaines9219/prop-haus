import crypto from 'node:crypto';
import { z } from 'zod';
import { CLIP_SOURCE, SOURCES, type ClipMeta, type SavedSource } from './types';
import { isSafeExternalUrl } from './safe-url';
import { PROJECT_SELECT, db, toProject } from './projects-db';

/**
 * A folder: a named collection of catalog items an org has saved while
 * browsing, so they have one place to review what they've found and click
 * through to the vendor.
 *
 * This used to be a submit-to-vendors / quote / approve workflow (see git
 * history if you need it). None of that ships in this version of the app —
 * a "project" is just a folder now.
 */
export type Project = {
  id: string;
  /** Owning organization. Server-assigned from the session — never accepted from a client. */
  orgId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Soft-hidden from the folder list when set. */
  archivedAt?: string;
  items: ProjectItem[];
};

/** A catalog item saved into a folder. Snapshotted so a folder survives the item being de-listed. */
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

/** Backed by Postgres (public.projects / public.project_items). Row mapping lives in lib/projects-db.ts. */

/** Throw rather than return empty: a read failure is not an absence of folders. */
function orThrow<T>(what: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
}

/**
 * One organization's folders, newest first. Archived folders are hidden unless asked for.
 *
 * Scoped by org rather than filtered by the caller, so a missing `where` clause
 * cannot leak another org's folders into a list view.
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
 * One folder, for a member of the owning organization. Returns undefined for
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
 * Create a folder, optionally seeded with items.
 *
 * `orgId` comes from the session (lib/session.ts), never from the request body.
 */
export async function createProject(
  orgId: string,
  name: string,
  items: ProjectItemInput[] = [],
): Promise<Project> {
  const id = crypto.randomBytes(16).toString('hex');
  const client = db();

  orThrow(
    'createProject',
    await client.from('projects').insert({ id, org_id: orgId, name }).select('id'),
  );

  if (items.length > 0) {
    orThrow(
      'createProject items',
      await client
        .from('project_items')
        .insert(items.map((item) => toItemRow(id, item)))
        .select('id'),
    );
  }

  const created = await getProject(orgId, id);
  if (!created) throw new Error('createProject: row vanished immediately after insert');
  return created;
}

/**
 * Save items into an existing folder. Re-saving an item already in the folder
 * is a no-op for that item (unique (project_id, item_id) — upsert ignores it).
 * Returns null when the folder does not exist or is not the caller's.
 */
export async function addItemsToProject(
  orgId: string,
  projectId: string,
  items: ProjectItemInput[],
): Promise<Project | null> {
  const owned = orThrow<{ id: string }[]>(
    'addItemsToProject.owner',
    await db().from('projects').select('id').eq('id', projectId).eq('org_id', orgId),
  );
  if (owned.length === 0) return null;

  if (items.length > 0) {
    orThrow(
      'addItemsToProject',
      await db()
        .from('project_items')
        .upsert(
          items.map((item) => toItemRow(projectId, item)),
          { onConflict: 'project_id,item_id', ignoreDuplicates: true },
        )
        .select('id'),
    );
  }

  return (await getProject(orgId, projectId)) ?? null;
}

/** Remove one saved item from a folder. Returns null when the folder isn't the caller's. */
export async function removeItemFromProject(
  orgId: string,
  projectId: string,
  itemId: string,
): Promise<Project | null> {
  const owned = orThrow<{ id: string }[]>(
    'removeItemFromProject.owner',
    await db().from('projects').select('id').eq('id', projectId).eq('org_id', orgId),
  );
  if (owned.length === 0) return null;

  await db().from('project_items').delete().eq('project_id', projectId).eq('item_id', itemId);

  return (await getProject(orgId, projectId)) ?? null;
}

/**
 * Archive or restore a folder. Scoped by org so one org cannot archive another's.
 * Returns null when the folder does not exist OR is not theirs.
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

function toItemRow(projectId: string, item: ProjectItemInput) {
  return {
    project_id: projectId,
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
