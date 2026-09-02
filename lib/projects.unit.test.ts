import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/test/helpers/fake-supabase';

/**
 * The project aggregate against the in-memory database: every write passes
 * the org gate, folders keep their kind rules, and documents land in the
 * bucket and the row together or not at all. The pure helpers and the RLS
 * boundary are covered in lib/projects.test.ts (integration).
 *
 * The fake does not apply column defaults, so this file stamps `added_at`
 * and `uploaded_at` on inserts the way Postgres would.
 */

vi.mock('@/lib/supabase/admin', async () => {
  const { db } = await import('@/test/mocks/supabase-admin');
  const stamps: Record<string, string> = { project_items: 'added_at', project_documents: 'uploaded_at' };
  let tick = 0;
  const stamp = (col: string, rows: Row | Row[]) => {
    const one = (r: Row): Row => ({ [col]: new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)).toISOString(), ...r });
    return Array.isArray(rows) ? rows.map(one) : one(rows);
  };
  return {
    createAdminClient: () => {
      const client = db.client();
      return {
        ...client,
        from: (table: string) => {
          const q = client.from(table);
          const col = stamps[table];
          if (!col) return q;
          const insert = q.insert.bind(q);
          const upsert = q.upsert.bind(q);
          q.insert = (rows) => insert(stamp(col, rows));
          q.upsert = (rows, opts) => upsert(stamp(col, rows), opts);
          return q;
        },
      };
    },
  };
});

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import {
  DEFAULT_SCENE_FOLDER_NAME,
  PAPERWORK_FOLDER_NAME,
  ProjectItemInputSchema,
  addDocument,
  addItemsToFolder,
  addItemsToProject,
  createFolder,
  createProject,
  deleteFolder,
  documentDownloadUrl,
  getProject,
  listProjects,
  removeDocument,
  removeItemFromFolder,
  removeItemFromProject,
  renameFolder,
  setProjectArchived,
  type ProjectItemInput,
} from './projects';

const T0 = '2026-09-01T00:00:00.000Z';

function seedProject(id: string, org = ORG_ID, over: Row = {}) {
  db.seed('projects', [{ id, org_id: org, name: `Project ${id}`, created_at: T0, updated_at: T0, archived_at: null, ...over }]);
  db.seed('project_folders', [
    { id: `${id}-scene`, project_id: id, name: 'Scene 1', kind: 'scene', position: 0, created_at: T0, updated_at: T0 },
    { id: `${id}-paper`, project_id: id, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T0, updated_at: T0 },
  ]);
}

function seedItem(projectId: string, folderId: string, itemId: string, over: Row = {}) {
  db.seed('project_items', [
    {
      project_id: projectId,
      folder_id: folderId,
      item_id: itemId,
      source: 'omega',
      source_id: itemId,
      name: 'Chair',
      image: null,
      source_url: `https://omegacinemaprops.com/item/${itemId}`,
      category: null,
      metadata: {},
      added_at: T0,
      ...over,
    },
  ]);
}

function input(itemId: string, over: Partial<ProjectItemInput> = {}): ProjectItemInput {
  return { itemId, source: 'omega', sourceId: itemId, name: 'Chair', sourceUrl: `https://omegacinemaprops.com/item/${itemId}`, ...over };
}

const PDF = { name: 'coi.pdf', mime: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) };

function projectRow(id: string) {
  return db.rows('projects').find((r) => r.id === id)!;
}

beforeEach(() => {
  db.reset();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
});

describe('listProjects', () => {
  it('lists the org’s live projects newest first with folders embedded', async () => {
    seedProject('old', ORG_ID, { created_at: '2026-08-01T00:00:00Z' });
    seedProject('new', ORG_ID, { created_at: '2026-09-02T00:00:00Z' });
    seedProject('archived', ORG_ID, { created_at: '2026-09-03T00:00:00Z', archived_at: '2026-09-04T00:00:00Z' });
    seedProject('theirs', OTHER_ORG_ID, { created_at: '2026-09-05T00:00:00Z' });

    const projects = await listProjects(ORG_ID);
    expect(projects.map((p) => p.id)).toEqual(['new', 'old']);
    expect(projects[0].folders.map((f) => f.kind)).toEqual(['scene', 'paperwork']);
  });

  it('includes archived projects on request', async () => {
    seedProject('live');
    seedProject('archived', ORG_ID, { archived_at: '2026-09-04T00:00:00Z' });
    const projects = await listProjects(ORG_ID, { includeArchived: true });
    expect(projects.map((p) => p.id).sort()).toEqual(['archived', 'live']);
    expect(projects.find((p) => p.id === 'archived')?.archivedAt).toBe('2026-09-04T00:00:00Z');
  });

  it('is empty for an org with nothing', async () => {
    seedProject('theirs', OTHER_ORG_ID);
    await expect(listProjects(ORG_ID)).resolves.toEqual([]);
  });

  it('throws on a read failure instead of pretending there are no projects', async () => {
    db.failNext('projects', 'select', 'connection reset');
    await expect(listProjects(ORG_ID)).rejects.toThrow('listProjects: connection reset');
  });
});

describe('getProject', () => {
  it('returns the aggregate with items in their folders', async () => {
    seedProject('p1');
    seedItem('p1', 'p1-scene', 'omega-1');
    const p = await getProject(ORG_ID, 'p1');
    expect(p).toMatchObject({ id: 'p1', orgId: ORG_ID, name: 'Project p1' });
    expect(p?.folders[0].items.map((i) => i.itemId)).toEqual(['omega-1']);
    expect(p?.folders[1]).toMatchObject({ kind: 'paperwork', items: [], documents: [] });
  });

  it('is undefined for another org’s project and for an unknown id alike', async () => {
    seedProject('p1', OTHER_ORG_ID);
    await expect(getProject(ORG_ID, 'p1')).resolves.toBeUndefined();
    await expect(getProject(ORG_ID, 'nope')).resolves.toBeUndefined();
  });

  it('throws on a read failure', async () => {
    db.failNext('projects', 'select', 'boom');
    await expect(getProject(ORG_ID, 'p1')).rejects.toThrow('getProject: boom');
  });
});

describe('createProject', () => {
  it('creates the project with a scene folder and a paperwork folder', async () => {
    const p = await createProject(ORG_ID, 'Nocturne');
    expect(p.id).toMatch(/^[0-9a-f]{32}$/);
    expect(p).toMatchObject({ orgId: ORG_ID, name: 'Nocturne' });
    expect(p.folders.map((f) => [f.name, f.kind, f.position])).toEqual([
      [DEFAULT_SCENE_FOLDER_NAME, 'scene', 0],
      [PAPERWORK_FOLDER_NAME, 'paperwork', 0],
    ]);
    expect(db.rows('projects')[0]).toMatchObject({ id: p.id, org_id: ORG_ID, name: 'Nocturne' });
    expect(db.rows('project_folders').map((f) => f.project_id)).toEqual([p.id, p.id]);
  });

  it('names the first scene when asked', async () => {
    const p = await createProject(ORG_ID, 'Nocturne', [], { sceneName: 'Sc. 12 diner' });
    expect(p.folders[0].name).toBe('Sc. 12 diner');
  });

  it('seeds the scene folder with items, keeping clip metadata and blanking catalog metadata', async () => {
    const p = await createProject(ORG_ID, 'Nocturne', [
      input('omega-1'),
      input('https://r/x', { source: 'clip', image: 'https://r/x.jpg', category: 'seating', meta: { retailer: 'R' } }),
    ]);
    const scene = p.folders[0];
    expect(scene.items.map((i) => i.itemId).sort()).toEqual(['https://r/x', 'omega-1']);
    const rows = db.rows('project_items');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.project_id === p.id && r.folder_id === scene.id)).toBe(true);
    expect(rows.find((r) => r.item_id === 'omega-1')).toMatchObject({ metadata: {}, image: null, category: null });
    expect(rows.find((r) => r.item_id === 'https://r/x')).toMatchObject({ metadata: { retailer: 'R' }, image: 'https://r/x.jpg', category: 'seating' });
    expect(scene.items.find((i) => i.itemId === 'https://r/x')?.meta).toEqual({ retailer: 'R' });
  });

  it('throws before writing folders when the project insert fails', async () => {
    db.failNext('projects', 'insert', 'boom');
    await expect(createProject(ORG_ID, 'X')).rejects.toThrow('createProject: boom');
    expect(db.rows('project_folders')).toEqual([]);
  });

  it('throws when the folder or item insert fails', async () => {
    db.failNext('project_folders', 'insert', 'no folders');
    await expect(createProject(ORG_ID, 'X')).rejects.toThrow('createProject folders: no folders');

    db.failNext('project_items', 'insert', 'no items');
    await expect(createProject(ORG_ID, 'Y', [input('a')])).rejects.toThrow('createProject items: no items');
  });
});

describe('setProjectArchived', () => {
  it('archives and restores, returning the fresh aggregate', async () => {
    seedProject('p1');
    const archived = await setProjectArchived(ORG_ID, 'p1', true);
    expect(archived?.archivedAt).toBeTypeOf('string');
    expect(projectRow('p1').archived_at).toBe(archived?.archivedAt);
    expect(projectRow('p1').updated_at).not.toBe(T0);

    const restored = await setProjectArchived(ORG_ID, 'p1', false);
    expect(restored).not.toHaveProperty('archivedAt');
    expect(projectRow('p1').archived_at).toBeNull();
  });

  it('is null and writes nothing for another org’s project or an unknown id', async () => {
    seedProject('p1', OTHER_ORG_ID);
    await expect(setProjectArchived(ORG_ID, 'p1', true)).resolves.toBeNull();
    await expect(setProjectArchived(ORG_ID, 'nope', true)).resolves.toBeNull();
    expect(projectRow('p1').archived_at).toBeNull();
  });

  it('throws on a write failure', async () => {
    seedProject('p1');
    db.failNext('projects', 'update', 'boom');
    await expect(setProjectArchived(ORG_ID, 'p1', true)).rejects.toThrow('setProjectArchived: boom');
  });
});

describe('createFolder', () => {
  it('appends after the last scene and touches the project', async () => {
    seedProject('p1');
    db.seed('project_folders', [{ id: 'p1-s3', project_id: 'p1', name: 'Later', kind: 'scene', position: 3, created_at: T0, updated_at: T0 }]);
    const folder = await createFolder(ORG_ID, 'p1', 'Apt interior');
    expect(folder).toMatchObject({ projectId: 'p1', name: 'Apt interior', kind: 'scene', position: 4, items: [], documents: [] });
    expect(projectRow('p1').updated_at).not.toBe(T0);
  });

  it('starts at position 0 when every scene folder is gone', async () => {
    db.seed('projects', [{ id: 'p1', org_id: ORG_ID, name: 'P', created_at: T0, updated_at: T0, archived_at: null }]);
    db.seed('project_folders', [{ id: 'p1-paper', project_id: 'p1', name: 'Paperwork', kind: 'paperwork', position: 7, created_at: T0, updated_at: T0 }]);
    expect((await createFolder(ORG_ID, 'p1', 'Scene 1'))?.position).toBe(0);
  });

  it('is null and writes nothing for another org’s project', async () => {
    seedProject('p1', OTHER_ORG_ID);
    await expect(createFolder(ORG_ID, 'p1', 'X')).resolves.toBeNull();
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('throws on an insert failure', async () => {
    seedProject('p1');
    db.failNext('project_folders', 'insert', 'boom');
    await expect(createFolder(ORG_ID, 'p1', 'X')).rejects.toThrow('createFolder: boom');
  });
});

describe('renameFolder', () => {
  it('renames a scene or the paperwork folder and returns the project', async () => {
    seedProject('p1');
    const p = await renameFolder(ORG_ID, 'p1', 'p1-scene', 'Sc. 4');
    expect(p?.folders[0].name).toBe('Sc. 4');
    const q = await renameFolder(ORG_ID, 'p1', 'p1-paper', 'Docs');
    expect(q?.folders[1].name).toBe('Docs');
    expect(projectRow('p1').updated_at).not.toBe(T0);
  });

  it('is null for another org’s folder or a folder of a different project', async () => {
    seedProject('p1');
    seedProject('p2', OTHER_ORG_ID);
    await expect(renameFolder(ORG_ID, 'p2', 'p2-scene', 'X')).resolves.toBeNull();
    await expect(renameFolder(ORG_ID, 'p1', 'p2-scene', 'X')).resolves.toBeNull();
    await expect(renameFolder(ORG_ID, 'p1', 'nope', 'X')).resolves.toBeNull();
    expect(db.rows('project_folders').find((f) => f.id === 'p2-scene')?.name).toBe('Scene 1');
  });

  it('throws on a write failure', async () => {
    seedProject('p1');
    db.failNext('project_folders', 'update', 'boom');
    await expect(renameFolder(ORG_ID, 'p1', 'p1-scene', 'X')).rejects.toThrow('renameFolder: boom');
  });
});

describe('deleteFolder', () => {
  it('deletes a scene folder', async () => {
    seedProject('p1');
    await expect(deleteFolder(ORG_ID, 'p1', 'p1-scene')).resolves.toBe('deleted');
    expect(db.rows('project_folders').map((f) => f.id)).toEqual(['p1-paper']);
    expect(projectRow('p1').updated_at).not.toBe(T0);
  });

  it('refuses to delete the paperwork folder', async () => {
    seedProject('p1');
    await expect(deleteFolder(ORG_ID, 'p1', 'p1-paper')).resolves.toBe('paperwork');
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('is not-found for another org or an unknown folder', async () => {
    seedProject('p1', OTHER_ORG_ID);
    await expect(deleteFolder(ORG_ID, 'p1', 'p1-scene')).resolves.toBe('not-found');
    await expect(deleteFolder(OTHER_ORG_ID, 'p1', 'nope')).resolves.toBe('not-found');
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('throws on a delete failure', async () => {
    seedProject('p1');
    db.failNext('project_folders', 'delete', 'boom');
    await expect(deleteFolder(ORG_ID, 'p1', 'p1-scene')).rejects.toThrow('deleteFolder: boom');
  });
});

describe('addItemsToFolder', () => {
  it('saves items into the scene folder and returns the project', async () => {
    seedProject('p1');
    const p = await addItemsToFolder(ORG_ID, 'p1', 'p1-scene', [input('a'), input('b', { image: 'https://img/b.jpg' })]);
    expect(p?.folders[0].items.map((i) => i.itemId).sort()).toEqual(['a', 'b']);
    expect(db.rows('project_items').map((r) => [r.project_id, r.folder_id])).toEqual([
      ['p1', 'p1-scene'],
      ['p1', 'p1-scene'],
    ]);
    expect(projectRow('p1').updated_at).not.toBe(T0);
  });

  it('does not duplicate an item already in the folder', async () => {
    seedProject('p1');
    seedItem('p1', 'p1-scene', 'a');
    const p = await addItemsToFolder(ORG_ID, 'p1', 'p1-scene', [input('a'), input('c')]);
    expect(db.rows('project_items').map((r) => r.item_id).sort()).toEqual(['a', 'c']);
    expect(p?.folders[0].items).toHaveLength(2);
  });

  it('writes nothing for an empty list but still returns the project', async () => {
    seedProject('p1');
    const p = await addItemsToFolder(ORG_ID, 'p1', 'p1-scene', []);
    expect(p?.id).toBe('p1');
    expect(db.log.some((l) => l.table === 'project_items')).toBe(false);
    expect(projectRow('p1').updated_at).toBe(T0);
  });

  it('is null for the paperwork folder and for another org', async () => {
    seedProject('p1');
    seedProject('p2', OTHER_ORG_ID);
    await expect(addItemsToFolder(ORG_ID, 'p1', 'p1-paper', [input('a')])).resolves.toBeNull();
    await expect(addItemsToFolder(ORG_ID, 'p2', 'p2-scene', [input('a')])).resolves.toBeNull();
    expect(db.rows('project_items')).toEqual([]);
  });

  it('throws on a write failure', async () => {
    seedProject('p1');
    db.failNext('project_items', 'upsert', 'boom');
    await expect(addItemsToFolder(ORG_ID, 'p1', 'p1-scene', [input('a')])).rejects.toThrow('addItemsToFolder: boom');
  });
});

describe('removeItemFromFolder', () => {
  it('removes the item from that folder only', async () => {
    seedProject('p1');
    db.seed('project_folders', [{ id: 'p1-s2', project_id: 'p1', name: 'Scene 2', kind: 'scene', position: 1, created_at: T0, updated_at: T0 }]);
    seedItem('p1', 'p1-scene', 'a');
    seedItem('p1', 'p1-s2', 'a');
    seedItem('p1', 'p1-scene', 'b');
    const p = await removeItemFromFolder(ORG_ID, 'p1', 'p1-scene', 'a');
    expect(p?.folders[0].items.map((i) => i.itemId)).toEqual(['b']);
    expect(p?.folders[1].items.map((i) => i.itemId)).toEqual(['a']);
    expect(projectRow('p1').updated_at).not.toBe(T0);
  });

  it('is a no-op for an unknown item and null for another org', async () => {
    seedProject('p1');
    seedItem('p1', 'p1-scene', 'a');
    expect((await removeItemFromFolder(ORG_ID, 'p1', 'p1-scene', 'zzz'))?.folders[0].items).toHaveLength(1);
    await expect(removeItemFromFolder(OTHER_ORG_ID, 'p1', 'p1-scene', 'a')).resolves.toBeNull();
    expect(db.rows('project_items')).toHaveLength(1);
  });
});

describe('addItemsToProject', () => {
  it('lands items in the first scene folder by display order', async () => {
    seedProject('p1');
    db.seed('project_folders', [{ id: 'p1-first', project_id: 'p1', name: 'B', kind: 'scene', position: -1, created_at: T0, updated_at: T0 }]);
    const p = await addItemsToProject(ORG_ID, 'p1', [input('a')]);
    expect(p?.folders[0].id).toBe('p1-first');
    expect(db.rows('project_items')[0].folder_id).toBe('p1-first');
  });

  it('recreates Scene 1 when every scene folder has been deleted', async () => {
    db.seed('projects', [{ id: 'p1', org_id: ORG_ID, name: 'P', created_at: T0, updated_at: T0, archived_at: null }]);
    db.seed('project_folders', [{ id: 'p1-paper', project_id: 'p1', name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T0, updated_at: T0 }]);
    const p = await addItemsToProject(ORG_ID, 'p1', [input('a')]);
    expect(p?.folders.map((f) => [f.name, f.kind])).toEqual([
      [DEFAULT_SCENE_FOLDER_NAME, 'scene'],
      [PAPERWORK_FOLDER_NAME, 'paperwork'],
    ]);
    expect(p?.folders[0].items.map((i) => i.itemId)).toEqual(['a']);
  });

  it('is null for another org’s project', async () => {
    seedProject('p1', OTHER_ORG_ID);
    await expect(addItemsToProject(ORG_ID, 'p1', [input('a')])).resolves.toBeNull();
    expect(db.rows('project_items')).toEqual([]);
  });
});

describe('removeItemFromProject', () => {
  it('removes the item from every scene folder', async () => {
    seedProject('p1');
    db.seed('project_folders', [{ id: 'p1-s2', project_id: 'p1', name: 'Scene 2', kind: 'scene', position: 1, created_at: T0, updated_at: T0 }]);
    seedItem('p1', 'p1-scene', 'a');
    seedItem('p1', 'p1-s2', 'a');
    seedItem('p1', 'p1-s2', 'b');
    seedProject('p2');
    seedItem('p2', 'p2-scene', 'a');
    const p = await removeItemFromProject(ORG_ID, 'p1', 'a');
    expect(p?.folders.flatMap((f) => f.items.map((i) => i.itemId))).toEqual(['b']);
    expect(db.rows('project_items').filter((r) => r.project_id === 'p2')).toHaveLength(1);
  });

  it('is null for another org', async () => {
    seedProject('p1', OTHER_ORG_ID);
    seedItem('p1', 'p1-scene', 'a');
    await expect(removeItemFromProject(ORG_ID, 'p1', 'a')).resolves.toBeNull();
    expect(db.rows('project_items')).toHaveLength(1);
  });
});

describe('addDocument', () => {
  beforeEach(() => seedProject('p1'));

  it('is a 404 for a scene folder, another org, or an unknown folder', async () => {
    seedProject('p2', OTHER_ORG_ID);
    await expect(addDocument(ORG_ID, 'p1', 'p1-scene', PDF)).resolves.toEqual({ ok: false, status: 404, error: 'not found' });
    await expect(addDocument(ORG_ID, 'p2', 'p2-paper', PDF)).resolves.toEqual({ ok: false, status: 404, error: 'not found' });
    await expect(addDocument(ORG_ID, 'p1', 'nope', PDF)).resolves.toEqual({ ok: false, status: 404, error: 'not found' });
    expect(db.buckets.size).toBe(0);
  });

  it('is a 400 with the reason for a file the folder will not take', async () => {
    await expect(addDocument(ORG_ID, 'p1', 'p1-paper', { ...PDF, bytes: new Uint8Array() })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'coi.pdf is empty.',
    });
    const zip = await addDocument(ORG_ID, 'p1', 'p1-paper', { name: 'x.zip', mime: 'application/zip', bytes: new Uint8Array([1]) });
    expect(zip).toMatchObject({ ok: false, status: 400 });
    expect(db.buckets.size).toBe(0);
  });

  it('stores the bytes and the row together and touches the project', async () => {
    const r = await addDocument(ORG_ID, 'p1', 'p1-paper', PDF);
    expect(r.ok).toBe(true);
    const { document } = r as Extract<typeof r, { ok: true }>;
    expect(document).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      folderId: 'p1-paper',
      name: 'coi.pdf',
      storagePath: `${ORG_ID}/p1/${document.id}.pdf`,
      mime: 'application/pdf',
      sizeBytes: 3,
      uploadedAt: expect.any(String),
    });
    expect(db.bucket('paperwork').get(document.storagePath)).toMatchObject({ contentType: 'application/pdf' });
    expect(db.rows('project_documents')[0]).toMatchObject({ id: document.id, project_id: 'p1', folder_id: 'p1-paper', size_bytes: 3 });
    expect(projectRow('p1').updated_at).not.toBe(T0);
    expect((await getProject(ORG_ID, 'p1'))?.folders[1].documents.map((d) => d.id)).toEqual([document.id]);
  });

  it('is a 500 with no row when storage refuses', async () => {
    db.failNextStorage('upload', 'bucket full');
    await expect(addDocument(ORG_ID, 'p1', 'p1-paper', PDF)).resolves.toEqual({ ok: false, status: 500, error: 'upload failed: bucket full' });
    expect(db.rows('project_documents')).toEqual([]);
    expect(projectRow('p1').updated_at).toBe(T0);
  });

  it('removes the object again when the row insert fails', async () => {
    db.failNext('project_documents', 'insert', 'boom');
    await expect(addDocument(ORG_ID, 'p1', 'p1-paper', PDF)).resolves.toEqual({ ok: false, status: 500, error: 'record failed: boom' });
    expect(db.bucket('paperwork').size).toBe(0);
    expect(db.rows('project_documents')).toEqual([]);
  });
});

describe('removeDocument', () => {
  async function seedDoc(projectId = 'p1') {
    const r = await addDocument(ORG_ID, projectId, `${projectId}-paper`, PDF);
    return (r as Extract<typeof r, { ok: true }>).document;
  }

  it('deletes the row and the bytes and returns the project', async () => {
    seedProject('p1');
    const doc = await seedDoc();
    const p = await removeDocument(ORG_ID, 'p1', doc.id);
    expect(p?.folders[1].documents).toEqual([]);
    expect(db.rows('project_documents')).toEqual([]);
    expect(db.bucket('paperwork').has(doc.storagePath)).toBe(false);
  });

  it('is null and keeps everything for another org, an unknown id, or another project’s document', async () => {
    seedProject('p1');
    seedProject('p2');
    const doc = await seedDoc();
    await expect(removeDocument(OTHER_ORG_ID, 'p1', doc.id)).resolves.toBeNull();
    await expect(removeDocument(ORG_ID, 'p1', 'nope')).resolves.toBeNull();
    await expect(removeDocument(ORG_ID, 'p2', doc.id)).resolves.toBeNull();
    expect(db.rows('project_documents')).toHaveLength(1);
    expect(db.bucket('paperwork').has(doc.storagePath)).toBe(true);
  });

  it('throws on a read failure', async () => {
    seedProject('p1');
    db.failNext('project_documents', 'select', 'boom');
    await expect(removeDocument(ORG_ID, 'p1', 'x')).rejects.toThrow('removeDocument.read: boom');
  });
});

describe('documentDownloadUrl', () => {
  it('signs a 60 second link that downloads under the display name', async () => {
    seedProject('p1');
    const r = await addDocument(ORG_ID, 'p1', 'p1-paper', { ...PDF, name: 'COI Newel.pdf' });
    const { document } = r as Extract<typeof r, { ok: true }>;
    await expect(documentDownloadUrl(ORG_ID, 'p1', document.id)).resolves.toEqual({
      url: expect.stringContaining(document.storagePath),
      name: 'COI Newel.pdf',
    });
    expect(db.signedUrls).toEqual([{ bucket: 'paperwork', path: document.storagePath, expiresIn: 60, options: { download: 'COI Newel.pdf' } }]);
  });

  it('is null for another org or an unknown document', async () => {
    seedProject('p1');
    const r = await addDocument(ORG_ID, 'p1', 'p1-paper', PDF);
    const { document } = r as Extract<typeof r, { ok: true }>;
    await expect(documentDownloadUrl(OTHER_ORG_ID, 'p1', document.id)).resolves.toBeNull();
    await expect(documentDownloadUrl(ORG_ID, 'p1', 'nope')).resolves.toBeNull();
    expect(db.signedUrls).toEqual([]);
  });

  it('throws when the object behind the row is gone', async () => {
    seedProject('p1');
    db.seed('project_documents', [{ id: 'd1', project_id: 'p1', folder_id: 'p1-paper', name: 'x.pdf', storage_path: 'gone.pdf', mime: 'application/pdf', size_bytes: 1, uploaded_at: T0 }]);
    await expect(documentDownloadUrl(ORG_ID, 'p1', 'd1')).rejects.toThrow('documentDownloadUrl: Object not found');
  });
});

describe('ProjectItemInputSchema', () => {
  it('accepts a catalog item and a clip', () => {
    expect(ProjectItemInputSchema.safeParse(input('omega-1')).success).toBe(true);
    expect(
      ProjectItemInputSchema.safeParse(input('https://r/x', { source: 'clip', meta: { retailer: 'R', price: { amount: 12, currency: 'USD' } } }))
        .success,
    ).toBe(true);
  });

  it('refuses unsafe urls, unknown sources, and stray meta keys', () => {
    expect(ProjectItemInputSchema.safeParse(input('a', { sourceUrl: 'javascript:alert(1)' })).success).toBe(false);
    expect(ProjectItemInputSchema.safeParse(input('a', { image: '//evil.example/x.jpg' })).success).toBe(false);
    expect(ProjectItemInputSchema.safeParse({ ...input('a'), source: 'amazon' }).success).toBe(false);
    expect(ProjectItemInputSchema.safeParse({ ...input('a'), meta: { retailer: 'R', sku: '1' } }).success).toBe(false);
    expect(ProjectItemInputSchema.safeParse(input('a', { name: 'x'.repeat(301) })).success).toBe(false);
    expect(ProjectItemInputSchema.safeParse(input('')).success).toBe(false);
  });
});
