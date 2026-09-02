import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addItemsToFolder,
  addItemsToProject,
  allItems,
  createFolder,
  createProject,
  defaultSceneFolder,
  deleteFolder,
  getProject,
  listProjects,
  paperworkFolder,
  projectDocumentCount,
  projectItemCount,
  removeItemFromFolder,
  removeItemFromProject,
  renameFolder,
  sceneFolders,
  setProjectArchived,
  DEFAULT_SCENE_FOLDER_NAME,
  PAPERWORK_FOLDER_NAME,
  type Project,
  type ProjectFolder,
  type ProjectItemInput,
} from './projects';

const item = (itemId: string): ProjectItemInput => ({
  itemId,
  source: 'gilandroy',
  sourceId: itemId,
  name: 'Chair',
  sourceUrl: 'https://example.com/chair',
});

// ── pure aggregate helpers (no database) ─────────────────────────────────────

function folder(over: Partial<ProjectFolder> & Pick<ProjectFolder, 'id' | 'kind'>): ProjectFolder {
  return {
    projectId: 'p1',
    name: over.id,
    position: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    items: [],
    documents: [],
    ...over,
  };
}

function project(folders: ProjectFolder[]): Project {
  return {
    id: 'p1',
    orgId: 'o1',
    name: 'Nocturne',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    folders,
  };
}

describe('project aggregate helpers', () => {
  const saved = (itemId: string, addedAt: string) => ({ ...item(itemId), addedAt });
  const p = project([
    folder({
      id: 'sc1',
      kind: 'scene',
      position: 0,
      items: [saved('a', '2026-09-01T10:00:00Z'), saved('b', '2026-09-01T12:00:00Z')],
    }),
    folder({ id: 'sc2', kind: 'scene', position: 1, items: [saved('c', '2026-09-01T11:00:00Z')] }),
    folder({
      id: 'pw',
      kind: 'paperwork',
      documents: [
        {
          id: 'd1',
          folderId: 'pw',
          name: 'coi.pdf',
          storagePath: 'o1/p1/d1.pdf',
          mime: 'application/pdf',
          sizeBytes: 10,
          uploadedAt: '2026-09-01T00:00:00Z',
        },
      ],
    }),
  ]);

  it('separates scene folders from the paperwork folder', () => {
    expect(sceneFolders(p).map((f) => f.id)).toEqual(['sc1', 'sc2']);
    expect(paperworkFolder(p)?.id).toBe('pw');
  });

  it('defaults to the first scene folder in display order', () => {
    expect(defaultSceneFolder(p)?.id).toBe('sc1');
    expect(defaultSceneFolder(project([folder({ id: 'pw', kind: 'paperwork' })]))).toBeUndefined();
  });

  it('counts items and documents across folders', () => {
    expect(projectItemCount(p)).toBe(3);
    expect(projectDocumentCount(p)).toBe(1);
  });

  it('flattens items across scenes, newest first', () => {
    expect(allItems(p).map((i) => i.itemId)).toEqual(['b', 'c', 'a']);
  });
});

// ── organization scoping (integration) ───────────────────────────────────────

/**
 * ORG SCOPING is an access boundary, tested as an INTEGRATION test against the
 * real database: `lib/projects.ts` uses the service-role client, which bypasses
 * RLS, so the `org_id` filters in its queries ARE the access control and a mock
 * would happily agree with a broken one.
 *
 * Creates two throwaway organizations and deletes them afterwards; folders,
 * items and documents cascade from projects. Skips when Supabase credentials are
 * absent, so the suite stays green without them rather than failing for the
 * wrong reason.
 */

const HAS_DB = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
);

describe.skipIf(!HAS_DB)('organization scoping (integration)', () => {
  const ORG_A = crypto.randomUUID();
  const ORG_B = crypto.randomUUID();

  async function admin() {
    const { createAdminClient } = await import('./supabase/admin');
    return createAdminClient();
  }

  beforeAll(async () => {
    const c = await admin();
    const { error } = await c.from('organizations').insert([
      { id: ORG_A, type: 'company', name: 'test org A', plan: 'free' },
      { id: ORG_B, type: 'company', name: 'test org B', plan: 'free' },
    ]);
    if (error) throw new Error(`seed orgs: ${error.message}`);
  });

  afterAll(async () => {
    // Cascades through projects -> project_folders -> project_items / project_documents.
    const c = await admin();
    await c.from('organizations').delete().in('id', [ORG_A, ORG_B]);
  });

  it('stamps the owning org and a 16-byte id, seeds both folders, and files items into the scene', async () => {
    const p = await createProject(ORG_A, 'stamp', [item('i1')]);
    expect(p.orgId).toBe(ORG_A);
    expect(p.id).toHaveLength(32);

    expect(sceneFolders(p).map((f) => f.name)).toEqual([DEFAULT_SCENE_FOLDER_NAME]);
    expect(paperworkFolder(p)?.name).toBe(PAPERWORK_FOLDER_NAME);
    expect(p.folders.at(-1)?.kind).toBe('paperwork');

    expect(projectItemCount(p)).toBe(1);
    expect(defaultSceneFolder(p)?.items[0]?.itemId).toBe('i1');
    expect(paperworkFolder(p)?.items).toHaveLength(0);
  });

  it('never returns another org’s projects', async () => {
    await createProject(ORG_A, 'project a');
    await createProject(ORG_B, 'project b');

    const a = await listProjects(ORG_A);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((p) => p.orgId === ORG_A)).toBe(true);
    expect(await listProjects(crypto.randomUUID())).toHaveLength(0);
  });

  it('hides archived projects unless asked for them', async () => {
    const p = await createProject(ORG_A, 'archivable');
    const before = (await listProjects(ORG_A)).length;

    expect(await setProjectArchived(ORG_A, p.id, true)).not.toBeNull();
    expect((await listProjects(ORG_A)).length).toBe(before - 1);
    expect((await listProjects(ORG_A, { includeArchived: true })).length).toBe(before);

    expect(await setProjectArchived(ORG_A, p.id, false)).not.toBeNull();
    expect((await listProjects(ORG_A)).length).toBe(before);
  });

  it('refuses to archive a project belonging to another org', async () => {
    const p = await createProject(ORG_A, 'not yours');
    // Reported as not-found rather than forbidden, so this cannot be used to
    // probe which project ids exist.
    expect(await setProjectArchived(ORG_B, p.id, true)).toBeNull();
    expect((await listProjects(ORG_A)).some((x) => x.id === p.id)).toBe(true);
  });

  it('returns null for an unknown id', async () => {
    expect(await setProjectArchived(ORG_A, 'nope', true)).toBeNull();
  });

  it('hides another org’s project from getProject', async () => {
    const p = await createProject(ORG_A, 'scoped read');
    expect(await getProject(ORG_B, p.id)).toBeUndefined();
    expect(await getProject(ORG_A, p.id)).toBeDefined();
  });

  it('adds scene folders in order, and only to the owning org', async () => {
    const p = await createProject(ORG_A, 'scenes');
    expect(await createFolder(ORG_B, p.id, 'intruder')).toBeNull();

    const sc2 = await createFolder(ORG_A, p.id, 'Sc. 12 diner');
    expect(sc2?.kind).toBe('scene');

    const after = await getProject(ORG_A, p.id);
    expect(sceneFolders(after!).map((f) => f.name)).toEqual([DEFAULT_SCENE_FOLDER_NAME, 'Sc. 12 diner']);
    expect(after!.folders.at(-1)?.kind).toBe('paperwork');
  });

  it('renames a folder for its owner only', async () => {
    const p = await createProject(ORG_A, 'rename');
    const sc = defaultSceneFolder(p)!;
    expect(await renameFolder(ORG_B, p.id, sc.id, 'stolen')).toBeNull();

    const renamed = await renameFolder(ORG_A, p.id, sc.id, 'Apt interior');
    expect(sceneFolders(renamed!)[0].name).toBe('Apt interior');
  });

  it('deletes a scene folder with its items, but never the paperwork folder', async () => {
    const p = await createProject(ORG_A, 'delete', [item('i0')]);
    const sc = defaultSceneFolder(p)!;
    const pw = paperworkFolder(p)!;

    expect(await deleteFolder(ORG_B, p.id, sc.id)).toBe('not-found');
    expect(await deleteFolder(ORG_A, p.id, pw.id)).toBe('paperwork');
    expect(await deleteFolder(ORG_A, p.id, sc.id)).toBe('deleted');

    const after = await getProject(ORG_A, p.id);
    expect(sceneFolders(after!)).toHaveLength(0);
    expect(paperworkFolder(after!)).toBeDefined();
    expect(projectItemCount(after!)).toBe(0);
  });

  it('refuses to add items to another org’s folder, and does not alter it', async () => {
    const p = await createProject(ORG_A, 'protected');
    const sc = defaultSceneFolder(p)!;
    expect(await addItemsToFolder(ORG_B, p.id, sc.id, [item('i2')])).toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(0);

    expect(await addItemsToFolder(ORG_A, p.id, sc.id, [item('i2')])).not.toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(1);
  });

  it('never files items into the paperwork folder', async () => {
    const p = await createProject(ORG_A, 'no items in paperwork');
    const pw = paperworkFolder(p)!;
    expect(await addItemsToFolder(ORG_A, p.id, pw.id, [item('i9')])).toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(0);
  });

  it('is idempotent when saving the same item twice to one folder, but allows it in two scenes', async () => {
    const p = await createProject(ORG_A, 'dedup', [item('i3')]);
    const sc1 = defaultSceneFolder(p)!;
    expect(await addItemsToFolder(ORG_A, p.id, sc1.id, [item('i3')])).not.toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(1);

    const sc2 = (await createFolder(ORG_A, p.id, 'second scene'))!;
    expect(await addItemsToFolder(ORG_A, p.id, sc2.id, [item('i3')])).not.toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(2);
  });

  it('refuses to remove items from another org’s folder', async () => {
    const p = await createProject(ORG_A, 'remove-protected', [item('i4')]);
    const sc = defaultSceneFolder(p)!;
    expect(await removeItemFromFolder(ORG_B, p.id, sc.id, 'i4')).toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(1);

    expect(await removeItemFromFolder(ORG_A, p.id, sc.id, 'i4')).not.toBeNull();
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(0);
  });

  it('project-level add lands in the first scene, recreating one if none is left', async () => {
    const p = await createProject(ORG_A, 'legacy add');
    expect(await addItemsToProject(ORG_B, p.id, [item('i5')])).toBeNull();

    const added = await addItemsToProject(ORG_A, p.id, [item('i5')]);
    expect(defaultSceneFolder(added!)?.items.map((i) => i.itemId)).toEqual(['i5']);

    await deleteFolder(ORG_A, p.id, defaultSceneFolder(added!)!.id);
    const recreated = await addItemsToProject(ORG_A, p.id, [item('i6')]);
    expect(sceneFolders(recreated!)).toHaveLength(1);
    expect(sceneFolders(recreated!)[0].name).toBe(DEFAULT_SCENE_FOLDER_NAME);
    expect(projectItemCount(recreated!)).toBe(1);
  });

  it('project-level remove clears the item from every scene', async () => {
    const p = await createProject(ORG_A, 'legacy remove', [item('i7')]);
    const sc2 = (await createFolder(ORG_A, p.id, 'also here'))!;
    await addItemsToFolder(ORG_A, p.id, sc2.id, [item('i7')]);
    expect(projectItemCount((await getProject(ORG_A, p.id))!)).toBe(2);

    expect(await removeItemFromProject(ORG_B, p.id, 'i7')).toBeNull();
    const cleared = await removeItemFromProject(ORG_A, p.id, 'i7');
    expect(projectItemCount(cleared!)).toBe(0);
  });
});
