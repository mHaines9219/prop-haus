import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
// The fake fills id/created_at/updated_at but not project_items.added_at, which
// the row mapper sorts on; stamp it the way the column default would.
vi.mock('@/lib/supabase/admin', async () => {
  const { db } = await import('@/test/mocks/supabase-admin');
  return {
    createAdminClient: () => {
      const client = db.client();
      return {
        ...client,
        from(table: string) {
          const q = client.from(table);
          if (table !== 'project_items') return q;
          const stamp = (rows: Record<string, unknown> | Record<string, unknown>[]) =>
            (Array.isArray(rows) ? rows : [rows]).map((r) => ({ added_at: new Date().toISOString(), ...r }));
          const insert = q.insert.bind(q);
          const upsert = q.upsert.bind(q);
          q.insert = (rows) => insert(stamp(rows));
          q.upsert = (rows, opts) => upsert(stamp(rows), opts);
          return q;
        },
      };
    },
  };
});
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { DELETE, POST } from './route';

/**
 * Project-level item routes (the pre-folders contract). Without a folderId,
 * items land in the first scene folder and removal clears every scene folder.
 */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';
const SCENE_A = '00000000-0000-4000-8000-00000000f001';
const SCENE_B = '00000000-0000-4000-8000-00000000f002';
const PAPERWORK = '00000000-0000-4000-8000-00000000f003';

const item = {
  itemId: 'omega-12345',
  source: 'omega',
  sourceId: '12345',
  name: 'Mid-century walnut credenza',
  image: 'https://omegacinemaprops.com/img/12345.jpg',
  sourceUrl: 'https://omegacinemaprops.com/item/12345',
  category: 'storage-credenzas',
};

function seedProject(orgId = ORG_ID, folders: Array<'a' | 'b' | 'paperwork'> = ['a', 'b', 'paperwork']) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', archived_at: null, created_at: T, updated_at: T }]);
  const rows: Record<string, unknown>[] = [];
  if (folders.includes('a')) rows.push({ id: SCENE_A, project_id: PROJECT_ID, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T });
  if (folders.includes('b')) rows.push({ id: SCENE_B, project_id: PROJECT_ID, name: 'Scene 2', kind: 'scene', position: 1, created_at: T, updated_at: T });
  if (folders.includes('paperwork')) rows.push({ id: PAPERWORK, project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T });
  db.seed('project_folders', rows);
}

function seedItem(folderId: string, itemId: string, addedAt = T) {
  db.seed('project_items', [
    { project_id: PROJECT_ID, folder_id: folderId, item_id: itemId, source: 'omega', source_id: itemId, name: itemId, image: null, source_url: `https://x.test/${itemId}`, category: null, metadata: {}, added_at: addedAt },
  ]);
}

const post = (body: unknown, id = PROJECT_ID) => POST(jsonRequest(`/api/projects/${id}/items`, body), params({ id }));
const del = (query: string, id = PROJECT_ID) =>
  DELETE(getRequest(`/api/projects/${id}/items?${query}`, { method: 'DELETE' }), params({ id }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.unique('project_items', ['folder_id', 'item_id']);
});

describe('POST /api/projects/[id]/items', () => {
  it('401 when signed out with a valid body, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await post({ items: [item] });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it.each([
    ['malformed JSON', null],
    ['no items', {}],
    ['empty items', { items: [] }],
    ['items not an array', { items: item }],
    ['over 100 items', { items: Array.from({ length: 101 }, (_, i) => ({ ...item, itemId: `i${i}` })) }],
    ['empty itemId', { items: [{ ...item, itemId: '' }] }],
    ['itemId over 512 chars', { items: [{ ...item, itemId: 'x'.repeat(513) }] }],
    ['empty name', { items: [{ ...item, name: '' }] }],
    ['name over 300 chars', { items: [{ ...item, name: 'x'.repeat(301) }] }],
    ['unknown source', { items: [{ ...item, source: 'ebay' }] }],
    ['javascript: image', { items: [{ ...item, image: 'javascript:alert(1)' }] }],
    ['protocol-relative sourceUrl', { items: [{ ...item, sourceUrl: '//evil.test/x' }] }],
    ['meta with unknown keys', { items: [{ ...item, meta: { retailer: 'x', evil: true } }] }],
    ['meta description over 4000 chars', { items: [{ ...item, meta: { description: 'x'.repeat(4001) } }] }],
    ['non-uuid folderId', { items: [item], folderId: 'scene-1' }],
  ])('400 for %s', async (_label, body) => {
    seedProject();
    const res = await post(body);
    const raw = body === null ? await POST(rawRequest(`/api/projects/${PROJECT_ID}/items`, '{nope'), params({ id: PROJECT_ID })) : res;
    expect(raw.status).toBe(400);
    expect(await readJson(raw)).toEqual({ error: 'invalid items' });
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('saves into the first scene folder when no folderId is given', async () => {
    seedProject();
    const res = await post({ items: [item, { ...item, itemId: 'omega-2', sourceId: '2' }] });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 2 });
    expect(db.rows('project_items')).toEqual([
      expect.objectContaining({
        project_id: PROJECT_ID,
        folder_id: SCENE_A,
        item_id: 'omega-12345',
        source: 'omega',
        source_id: '12345',
        name: 'Mid-century walnut credenza',
        image: 'https://omegacinemaprops.com/img/12345.jpg',
        source_url: 'https://omegacinemaprops.com/item/12345',
        category: 'storage-credenzas',
        metadata: {},
      }),
      expect.objectContaining({ folder_id: SCENE_A, item_id: 'omega-2' }),
    ]);
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('targets the named scene folder', async () => {
    seedProject();
    seedItem(SCENE_A, 'existing');
    const res = await post({ items: [item], folderId: SCENE_B });
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 2 });
    expect(db.rows('project_items').find((r) => r.item_id === 'omega-12345')).toMatchObject({ folder_id: SCENE_B });
  });

  it('stores a web clip’s meta in the metadata column', async () => {
    seedProject();
    const clip = {
      itemId: 'clip:abc',
      source: 'clip',
      sourceId: 'https://shop.test/lamp',
      name: 'Brass lamp',
      sourceUrl: 'https://shop.test/lamp',
      meta: { retailer: 'shop.test', price: { amount: 89, currency: 'USD' }, description: 'A lamp.' },
    };
    await post({ items: [clip] });
    expect(db.rows('project_items')[0]).toMatchObject({
      item_id: 'clip:abc',
      source: 'clip',
      image: null,
      category: null,
      metadata: { retailer: 'shop.test', price: { amount: 89, currency: 'USD' }, description: 'A lamp.' },
    });
  });

  it('re-saving an item already in the folder adds no row', async () => {
    seedProject();
    await post({ items: [item] });
    const res = await post({ items: [item] });
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
    expect(db.rows('project_items')).toHaveLength(1);
  });

  it('recreates Scene 1 when every scene folder has been deleted', async () => {
    seedProject(ORG_ID, ['paperwork']);
    const res = await post({ items: [item] });
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
    const scene = db.rows('project_folders').find((f) => f.kind === 'scene');
    expect(scene).toMatchObject({ project_id: PROJECT_ID, name: 'Scene 1', position: 0 });
    expect(db.rows('project_items')[0]).toMatchObject({ folder_id: scene!.id });
  });

  it('404 for the paperwork folder — items never live there', async () => {
    seedProject();
    const res = await post({ items: [item], folderId: PAPERWORK });
    expect(res.status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('404 for a folder that belongs to a different project', async () => {
    seedProject();
    db.seed('projects', [{ id: 'proj-2', org_id: ORG_ID, name: 'Other', archived_at: null, created_at: T, updated_at: T }]);
    const [foreign] = db.seed('project_folders', [
      { id: '00000000-0000-4000-8000-00000000f009', project_id: 'proj-2', name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    ]);
    const res = await post({ items: [item], folderId: foreign.id as string });
    expect(res.status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('404 for another org’s project, with or without a folderId', async () => {
    seedProject(OTHER_ORG_ID);
    expect((await post({ items: [item] })).status).toBe(404);
    expect((await post({ items: [item], folderId: SCENE_A })).status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('surfaces a write failure', async () => {
    seedProject();
    db.failNext('project_items', 'upsert', 'statement timeout');
    await expect(post({ items: [item] })).rejects.toThrow('addItemsToFolder: statement timeout');
  });
});

describe('DELETE /api/projects/[id]/items', () => {
  it('400 without an itemId, before checking the session', async () => {
    signOut();
    const res = await del('');
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'itemId is required' });
  });

  it('401 when signed out, before touching the database', async () => {
    signOut();
    seedProject();
    seedItem(SCENE_A, 'x');
    const res = await del('itemId=x');
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
    expect(db.rows('project_items')).toHaveLength(1);
  });

  it('removes the item from every scene folder when no folderId is given', async () => {
    seedProject();
    seedItem(SCENE_A, 'x');
    seedItem(SCENE_B, 'x');
    seedItem(SCENE_B, 'keep');
    const res = await del('itemId=x');
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
    expect(db.rows('project_items').map((r) => r.item_id)).toEqual(['keep']);
  });

  it('removes the item from only the named folder', async () => {
    seedProject();
    seedItem(SCENE_A, 'x');
    seedItem(SCENE_B, 'x');
    const res = await del(`itemId=x&folderId=${SCENE_A}`);
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
    expect(db.rows('project_items')).toEqual([expect.objectContaining({ folder_id: SCENE_B, item_id: 'x' })]);
  });

  it('is a no-op 200 for an item that is not saved', async () => {
    seedProject();
    seedItem(SCENE_A, 'x');
    const res = await del('itemId=nope');
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
  });

  it('404 for another org’s project and leaves its items alone', async () => {
    seedProject(OTHER_ORG_ID);
    seedItem(SCENE_A, 'x');
    expect((await del('itemId=x')).status).toBe(404);
    expect((await del(`itemId=x&folderId=${SCENE_A}`)).status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(1);
  });

  it('404 for a folder in another project of the same org', async () => {
    seedProject();
    db.seed('projects', [{ id: 'proj-2', org_id: ORG_ID, name: 'Other', archived_at: null, created_at: T, updated_at: T }]);
    db.seed('project_folders', [
      { id: '00000000-0000-4000-8000-00000000f009', project_id: 'proj-2', name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    ]);
    const res = await del('itemId=x&folderId=00000000-0000-4000-8000-00000000f009');
    expect(res.status).toBe(404);
  });
});
