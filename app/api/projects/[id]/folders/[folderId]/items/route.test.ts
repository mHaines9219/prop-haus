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

/** Per-folder item routes: scene folders take items, the paperwork folder answers 404. */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';
const SCENE_A = 'folder-a';
const SCENE_B = 'folder-b';
const PAPERWORK = 'folder-paperwork';

const item = {
  itemId: 'omega-12345',
  source: 'omega',
  sourceId: '12345',
  name: 'Mid-century walnut credenza',
  image: 'https://omegacinemaprops.com/img/12345.jpg',
  sourceUrl: 'https://omegacinemaprops.com/item/12345',
  category: 'storage-credenzas',
};

const clip = {
  itemId: 'clip:9f3a',
  source: 'clip',
  sourceId: 'https://www.wayfair.com/lamp',
  name: 'Brass arc lamp',
  image: 'https://assets.wfcdn.com/lamp.jpg',
  sourceUrl: 'https://www.wayfair.com/lamp',
  meta: { retailer: 'Wayfair', price: { amount: 249.99, currency: 'USD' }, description: 'A tall brass lamp.' },
};

function seedProject(orgId = ORG_ID) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', archived_at: null, created_at: T, updated_at: T }]);
  db.seed('project_folders', [
    { id: SCENE_A, project_id: PROJECT_ID, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: SCENE_B, project_id: PROJECT_ID, name: 'Scene 2', kind: 'scene', position: 1, created_at: T, updated_at: T },
    { id: PAPERWORK, project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

function seedItem(folderId: string, itemId: string, addedAt = T) {
  db.seed('project_items', [
    { project_id: PROJECT_ID, folder_id: folderId, item_id: itemId, source: 'omega', source_id: itemId, name: itemId, image: null, source_url: `https://x.test/${itemId}`, category: null, metadata: {}, added_at: addedAt },
  ]);
}

const post = (folderId: string, body: unknown, id = PROJECT_ID) =>
  POST(jsonRequest(`/api/projects/${id}/folders/${folderId}/items`, body), params({ id, folderId }));
const del = (folderId: string, query: string, id = PROJECT_ID) =>
  DELETE(getRequest(`/api/projects/${id}/folders/${folderId}/items?${query}`, { method: 'DELETE' }), params({ id, folderId }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.unique('project_items', ['folder_id', 'item_id']);
});

describe('POST /api/projects/[id]/folders/[folderId]/items', () => {
  it('401 when signed out with a valid body, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await post(SCENE_A, { items: [item] });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it.each([
    ['no items', {}],
    ['empty items', { items: [] }],
    ['items not an array', { items: 'x' }],
    ['over 100 items', { items: Array.from({ length: 101 }, (_, i) => ({ ...item, itemId: `i${i}` })) }],
    ['empty itemId', { items: [{ ...item, itemId: '' }] }],
    ['empty sourceId', { items: [{ ...item, sourceId: '' }] }],
    ['sourceId over 2048 chars', { items: [{ ...item, sourceId: 'x'.repeat(2049) }] }],
    ['name over 300 chars', { items: [{ ...item, name: 'x'.repeat(301) }] }],
    ['category over 120 chars', { items: [{ ...item, category: 'x'.repeat(121) }] }],
    ['unknown source', { items: [{ ...item, source: 'amazon' }] }],
    ['missing sourceUrl', { items: [{ ...item, sourceUrl: undefined }] }],
    ['data: image', { items: [{ ...item, image: 'data:text/html,<script>' }] }],
    ['meta price without currency', { items: [{ ...clip, meta: { price: { amount: 1 } } }] }],
    ['meta price with a non-finite amount', { items: [{ ...clip, meta: { price: { amount: 'NaN', currency: 'USD' } } }] }],
    ['meta with unknown keys', { items: [{ ...clip, meta: { sku: '1' } }] }],
  ])('400 for %s', async (_label, body) => {
    seedProject();
    const res = await post(SCENE_A, body);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid items' });
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('400 for malformed JSON', async () => {
    seedProject();
    const res = await POST(
      rawRequest(`/api/projects/${PROJECT_ID}/folders/${SCENE_A}/items`, '{nope'),
      params({ id: PROJECT_ID, folderId: SCENE_A }),
    );
    expect(res.status).toBe(400);
  });

  it('saves the items into the folder and answers that folder’s count', async () => {
    seedProject();
    seedItem(SCENE_B, 'elsewhere');
    const res = await post(SCENE_A, { items: [item, { ...item, itemId: 'omega-2', sourceId: '2', image: undefined, category: undefined }] });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 2 });

    expect(db.rows('project_items').filter((r) => r.folder_id === SCENE_A)).toEqual([
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
      expect.objectContaining({ item_id: 'omega-2', image: null, category: null, metadata: {} }),
    ]);
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('stores a web clip with its meta in the metadata column', async () => {
    seedProject();
    const res = await post(SCENE_A, { items: [clip] });
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
    expect(db.rows('project_items')[0]).toMatchObject({
      item_id: 'clip:9f3a',
      source: 'clip',
      source_id: 'https://www.wayfair.com/lamp',
      name: 'Brass arc lamp',
      image: 'https://assets.wfcdn.com/lamp.jpg',
      source_url: 'https://www.wayfair.com/lamp',
      category: null,
      metadata: { retailer: 'Wayfair', price: { amount: 249.99, currency: 'USD' }, description: 'A tall brass lamp.' },
    });
  });

  it('re-saving an item already in the folder adds no row', async () => {
    seedProject();
    await post(SCENE_A, { items: [item] });
    const res = await post(SCENE_A, { items: [item, { ...item, itemId: 'omega-2', sourceId: '2' }] });
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 2 });
    expect(db.rows('project_items')).toHaveLength(2);
  });

  it('the same item can live in two scene folders of one project', async () => {
    seedProject();
    await post(SCENE_A, { items: [item] });
    await post(SCENE_B, { items: [item] });
    expect(db.rows('project_items').map((r) => r.folder_id).sort()).toEqual([SCENE_A, SCENE_B]);
  });

  it('404 for the paperwork folder and writes nothing', async () => {
    seedProject();
    const res = await post(PAPERWORK, { items: [item] });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('404 for another org’s folder', async () => {
    seedProject(OTHER_ORG_ID);
    expect((await post(SCENE_A, { items: [item] })).status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('404 for a folder in a different project of the same org', async () => {
    seedProject();
    db.seed('projects', [{ id: 'proj-2', org_id: ORG_ID, name: 'Other', archived_at: null, created_at: T, updated_at: T }]);
    db.seed('project_folders', [{ id: 'foreign', project_id: 'proj-2', name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T }]);
    expect((await post('foreign', { items: [item] })).status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('surfaces a write failure', async () => {
    seedProject();
    db.failNext('project_items', 'upsert', 'statement timeout');
    await expect(post(SCENE_A, { items: [item] })).rejects.toThrow('addItemsToFolder: statement timeout');
  });
});

describe('DELETE /api/projects/[id]/folders/[folderId]/items', () => {
  it('400 without an itemId, before checking the session', async () => {
    signOut();
    const res = await del(SCENE_A, '');
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'itemId is required' });
  });

  it('401 when signed out, before touching the database', async () => {
    signOut();
    seedProject();
    seedItem(SCENE_A, 'x');
    expect((await del(SCENE_A, 'itemId=x')).status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('removes the item from this folder only', async () => {
    seedProject();
    seedItem(SCENE_A, 'x');
    seedItem(SCENE_A, 'keep', '2026-09-01T11:00:00.000Z');
    seedItem(SCENE_B, 'x');
    const res = await del(SCENE_A, 'itemId=x');
    expect(await readJson(res)).toEqual({ ok: true, itemCount: 1 });
    expect(db.rows('project_items').map((r) => [r.folder_id, r.item_id])).toEqual([
      [SCENE_A, 'keep'],
      [SCENE_B, 'x'],
    ]);
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('is a no-op 200 for an item the folder does not hold', async () => {
    seedProject();
    seedItem(SCENE_A, 'x');
    expect(await readJson(await del(SCENE_A, 'itemId=nope'))).toEqual({ ok: true, itemCount: 1 });
  });

  it('404 for another org’s folder and leaves the item in place', async () => {
    seedProject(OTHER_ORG_ID);
    seedItem(SCENE_A, 'x');
    expect((await del(SCENE_A, 'itemId=x')).status).toBe(404);
    expect(db.rows('project_items')).toHaveLength(1);
  });

  it('404 for an unknown folder', async () => {
    seedProject();
    expect((await del('missing', 'itemId=x')).status).toBe(404);
  });
});
