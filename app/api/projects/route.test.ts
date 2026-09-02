import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';

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
          const insert = q.insert.bind(q);
          q.insert = (rows) =>
            insert((Array.isArray(rows) ? rows : [rows]).map((r) => ({ added_at: new Date().toISOString(), ...r })));
          return q;
        },
      };
    },
  };
});
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET, POST } from './route';

/**
 * Project list + create. A project is born with two folders — "Scene 1" and
 * "Paperwork" — and the list only ever shows the caller's own, live projects.
 */

const T = '2026-09-01T10:00:00.000Z';

const item = {
  itemId: 'omega-12345',
  source: 'omega',
  sourceId: '12345',
  name: 'Mid-century walnut credenza',
  image: 'https://omegacinemaprops.com/img/12345.jpg',
  sourceUrl: 'https://omegacinemaprops.com/item/12345',
  category: 'storage-credenzas',
};

function seedProject(id: string, orgId: string, over: Record<string, unknown> = {}) {
  db.seed('projects', [{ id, org_id: orgId, name: `Project ${id}`, archived_at: null, created_at: T, updated_at: T, ...over }]);
  const [scene, paperwork] = db.seed('project_folders', [
    { project_id: id, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { project_id: id, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
  return { sceneId: scene.id as string, paperworkId: paperwork.id as string };
}

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.unique('project_items', ['folder_id', 'item_id']);
});

describe('GET /api/projects', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'not signed in' });
    expect(db.log).toEqual([]);
  });

  it('lists only the org’s live projects with folder and item counts, newest first', async () => {
    const mine = seedProject('p-old', ORG_ID, { created_at: '2026-08-01T00:00:00.000Z' });
    seedProject('p-new', ORG_ID, { created_at: '2026-09-01T00:00:00.000Z' });
    seedProject('p-archived', ORG_ID, { archived_at: T });
    seedProject('p-theirs', OTHER_ORG_ID);
    db.seed('project_items', [
      { project_id: 'p-old', folder_id: mine.sceneId, item_id: 'a', source: 'omega', source_id: 'a', name: 'A', image: null, source_url: 'https://x.test/a', category: null, metadata: {}, added_at: T },
      { project_id: 'p-old', folder_id: mine.sceneId, item_id: 'b', source: 'omega', source_id: 'b', name: 'B', image: null, source_url: 'https://x.test/b', category: null, metadata: {}, added_at: '2026-09-01T11:00:00.000Z' },
    ]);
    db.seed('project_documents', [
      { project_id: 'p-old', folder_id: mine.paperworkId, name: 'coi.pdf', storage_path: `${ORG_ID}/p-old/d.pdf`, mime: 'application/pdf', size_bytes: 10, uploaded_at: T },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      projects: [
        {
          id: 'p-new',
          name: 'Project p-new',
          itemCount: 0,
          documentCount: 0,
          folders: [
            { id: expect.any(String), name: 'Scene 1', kind: 'scene', itemCount: 0, documentCount: 0 },
            { id: expect.any(String), name: 'Paperwork', kind: 'paperwork', itemCount: 0, documentCount: 0 },
          ],
        },
        {
          id: 'p-old',
          name: 'Project p-old',
          itemCount: 2,
          documentCount: 1,
          folders: [
            { id: mine.sceneId, name: 'Scene 1', kind: 'scene', itemCount: 2, documentCount: 0 },
            { id: mine.paperworkId, name: 'Paperwork', kind: 'paperwork', itemCount: 0, documentCount: 1 },
          ],
        },
      ],
    });
  });

  it('answers an empty list rather than another org’s projects', async () => {
    seedProject('p-theirs', OTHER_ORG_ID);
    expect(await readJson(await GET())).toEqual({ projects: [] });
  });

  it('surfaces a read failure instead of pretending there are no projects', async () => {
    db.failNext('projects', 'select', 'connection reset');
    await expect(GET()).rejects.toThrow('listProjects: connection reset');
  });
});

describe('POST /api/projects', () => {
  it('401 when signed out with a valid body, before writing anything', async () => {
    signOut();
    const res = await POST(jsonRequest('/api/projects', { name: 'Night Shoot' }));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it.each([
    ['malformed JSON', null],
    ['no name', {}],
    ['empty name', { name: '' }],
    ['whitespace name', { name: '   ' }],
    ['non-string name', { name: 42 }],
    ['name over 200 chars', { name: 'x'.repeat(201) }],
    ['items not an array', { name: 'ok', items: 'nope' }],
    ['over 100 items', { name: 'ok', items: Array.from({ length: 101 }, () => item) }],
    ['item with a javascript: image', { name: 'ok', items: [{ ...item, image: 'javascript:alert(1)' }] }],
    ['item with an unknown source', { name: 'ok', items: [{ ...item, source: 'ebay' }] }],
    ['item with a relative sourceUrl', { name: 'ok', items: [{ ...item, sourceUrl: '/item/1' }] }],
  ])('400 for %s', async (_label, body) => {
    const res = await POST(
      body === null ? rawRequest('/api/projects', '{not json') : jsonRequest('/api/projects', body),
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'name is required' });
    expect(db.rows('projects')).toHaveLength(0);
  });

  it('creates the project with a Scene 1 and a Paperwork folder', async () => {
    const res = await POST(jsonRequest('/api/projects', { name: '  Night Shoot  ' }));
    expect(res.status).toBe(200);
    const body = await readJson<{ id: string; folders: { id: string; name: string; kind: string }[] }>(res);

    expect(body.id).toMatch(/^[0-9a-f]{32}$/);
    expect(body.folders).toEqual([
      { id: expect.any(String), name: 'Scene 1', kind: 'scene' },
      { id: expect.any(String), name: 'Paperwork', kind: 'paperwork' },
    ]);

    expect(db.rows('projects')).toEqual([expect.objectContaining({ id: body.id, org_id: ORG_ID, name: 'Night Shoot' })]);
    expect(db.rows('project_folders')).toEqual([
      expect.objectContaining({ project_id: body.id, name: 'Scene 1', kind: 'scene', position: 0 }),
      expect.objectContaining({ project_id: body.id, name: 'Paperwork', kind: 'paperwork', position: 0 }),
    ]);
    expect(db.rows('project_items')).toHaveLength(0);
  });

  it('seeds the scene folder with the items, snapshotted as rows', async () => {
    const res = await POST(
      jsonRequest('/api/projects', {
        name: 'Night Shoot',
        items: [item, { ...item, itemId: 'clip:abc', source: 'clip', sourceId: 'https://shop.test/x', meta: { retailer: 'Shop', price: { amount: 12.5, currency: 'USD' } } }],
      }),
    );
    const { id, folders } = await readJson<{ id: string; folders: { id: string; kind: string }[] }>(res);
    const scene = folders.find((f) => f.kind === 'scene')!;

    expect(db.rows('project_items')).toEqual([
      expect.objectContaining({
        project_id: id,
        folder_id: scene.id,
        item_id: 'omega-12345',
        source: 'omega',
        source_id: '12345',
        name: 'Mid-century walnut credenza',
        image: 'https://omegacinemaprops.com/img/12345.jpg',
        source_url: 'https://omegacinemaprops.com/item/12345',
        category: 'storage-credenzas',
        metadata: {},
      }),
      expect.objectContaining({
        item_id: 'clip:abc',
        source: 'clip',
        folder_id: scene.id,
        metadata: { retailer: 'Shop', price: { amount: 12.5, currency: 'USD' } },
      }),
    ]);
  });

  it('files the project under the session org even when the body names another', async () => {
    await POST(jsonRequest('/api/projects', { name: 'Night Shoot', orgId: OTHER_ORG_ID, org_id: OTHER_ORG_ID }));
    expect(db.rows('projects')[0].org_id).toBe(ORG_ID);
  });

  it('surfaces a failed insert rather than answering with a phantom id', async () => {
    db.failNext('projects', 'insert', 'disk full');
    await expect(POST(jsonRequest('/api/projects', { name: 'Night Shoot' }))).rejects.toThrow('createProject: disk full');
    expect(db.rows('project_folders')).toHaveLength(0);
  });

  // Observed: no event is written — EVENT_TYPES declares project_created but nothing records it.
  it.fails('records a project_created event', async () => {
    await POST(jsonRequest('/api/projects', { name: 'Night Shoot' }));
    expect(db.rows('events')).toEqual([expect.objectContaining({ org_id: ORG_ID, type: 'project_created' })]);
  });
});
