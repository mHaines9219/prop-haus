import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

/** Adding a scene folder: appended after the existing scenes, never a second paperwork folder. */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';

function seedProject(orgId = ORG_ID, scenes = 1) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', archived_at: null, created_at: T, updated_at: T }]);
  db.seed('project_folders', [
    ...Array.from({ length: scenes }, (_, i) => ({
      project_id: PROJECT_ID, name: `Scene ${i + 1}`, kind: 'scene', position: i, created_at: T, updated_at: T,
    })),
    { project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const post = (body: unknown, id = PROJECT_ID) => POST(jsonRequest(`/api/projects/${id}/folders`, body), params({ id }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
});

describe('POST /api/projects/[id]/folders', () => {
  it('401 when signed out with a valid body, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await post({ name: 'Sc. 12 diner' });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it.each([
    ['no name', {}],
    ['empty name', { name: '' }],
    ['whitespace name', { name: '  \t ' }],
    ['non-string name', { name: ['x'] }],
    ['name over 120 chars', { name: 'x'.repeat(121) }],
  ])('400 for %s', async (_label, body) => {
    seedProject();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'name is required' });
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('400 for malformed JSON', async () => {
    seedProject();
    const res = await POST(rawRequest(`/api/projects/${PROJECT_ID}/folders`, '{nope'), params({ id: PROJECT_ID }));
    expect(res.status).toBe(400);
  });

  it('appends a scene folder after the existing scenes', async () => {
    seedProject(ORG_ID, 2);
    const res = await post({ name: '  Sc. 12 diner  ' });
    expect(res.status).toBe(200);
    const body = await readJson<{ id: string; name: string; kind: string }>(res);
    expect(body).toEqual({ id: expect.any(String), name: 'Sc. 12 diner', kind: 'scene' });

    const created = db.rows('project_folders').find((f) => f.id === body.id);
    expect(created).toMatchObject({ project_id: PROJECT_ID, name: 'Sc. 12 diner', kind: 'scene', position: 2 });
    expect(db.rows('project_folders')).toHaveLength(4);
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('starts at position 0 when the project has no scene folders left', async () => {
    seedProject(ORG_ID, 0);
    const { id } = await readJson<{ id: string }>(await post({ name: 'Fresh' }));
    expect(db.rows('project_folders').find((f) => f.id === id)).toMatchObject({ position: 0, kind: 'scene' });
  });

  it('always creates a scene folder even when the body asks for paperwork', async () => {
    seedProject();
    const { id } = await readJson<{ id: string }>(await post({ name: 'Paperwork', kind: 'paperwork' }));
    expect(db.rows('project_folders').find((f) => f.id === id)).toMatchObject({ kind: 'scene' });
    expect(db.rows('project_folders').filter((f) => f.kind === 'paperwork')).toHaveLength(1);
  });

  it('404 for another org’s project and writes nothing', async () => {
    seedProject(OTHER_ORG_ID);
    const res = await post({ name: 'Sc. 12 diner' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('404 for an unknown project', async () => {
    expect((await post({ name: 'x' }, 'missing')).status).toBe(404);
  });

  it('surfaces an insert failure', async () => {
    seedProject();
    db.failNext('project_folders', 'insert', 'out of space');
    await expect(post({ name: 'x' })).rejects.toThrow('createFolder: out of space');
  });
});
