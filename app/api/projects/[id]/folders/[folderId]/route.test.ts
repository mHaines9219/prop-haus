import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { DELETE, PATCH } from './route';

/** Rename either kind of folder; delete a scene folder and its items; never delete the paperwork folder. */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';
const SCENE = 'folder-scene';
const PAPERWORK = 'folder-paperwork';

function seedProject(orgId = ORG_ID) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', archived_at: null, created_at: T, updated_at: T }]);
  db.seed('project_folders', [
    { id: SCENE, project_id: PROJECT_ID, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: PAPERWORK, project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const patch = (folderId: string, body: unknown, id = PROJECT_ID) =>
  PATCH(jsonRequest(`/api/projects/${id}/folders/${folderId}`, body, { method: 'PATCH' }), params({ id, folderId }));
const del = (folderId: string, id = PROJECT_ID) =>
  DELETE(getRequest(`/api/projects/${id}/folders/${folderId}`, { method: 'DELETE' }), params({ id, folderId }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
});

describe('PATCH /api/projects/[id]/folders/[folderId]', () => {
  it('401 when signed out with a valid body, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await patch(SCENE, { name: 'Diner' });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it.each([
    ['no name', {}],
    ['empty name', { name: '' }],
    ['whitespace name', { name: '   ' }],
    ['non-string name', { name: 7 }],
    ['name over 120 chars', { name: 'x'.repeat(121) }],
  ])('400 for %s', async (_label, body) => {
    seedProject();
    const res = await patch(SCENE, body);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'name is required' });
    expect(db.rows('project_folders').find((f) => f.id === SCENE)!.name).toBe('Scene 1');
  });

  it('400 for malformed JSON', async () => {
    seedProject();
    const res = await PATCH(
      rawRequest(`/api/projects/${PROJECT_ID}/folders/${SCENE}`, '{nope', { method: 'PATCH' }),
      params({ id: PROJECT_ID, folderId: SCENE }),
    );
    expect(res.status).toBe(400);
  });

  it('renames a scene folder, trimmed, and touches the project', async () => {
    seedProject();
    const res = await patch(SCENE, { name: '  Sc. 12 diner  ' });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
    const folder = db.rows('project_folders').find((f) => f.id === SCENE)!;
    expect(folder.name).toBe('Sc. 12 diner');
    expect(folder.updated_at).not.toBe(T);
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('renames the paperwork folder too — the kind, not the name, is what the UI keys on', async () => {
    seedProject();
    await patch(PAPERWORK, { name: 'Docs' });
    expect(db.rows('project_folders').find((f) => f.id === PAPERWORK)).toMatchObject({ name: 'Docs', kind: 'paperwork' });
  });

  it('404 for another org’s folder and leaves the name alone', async () => {
    seedProject(OTHER_ORG_ID);
    const res = await patch(SCENE, { name: 'Diner' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(db.rows('project_folders').find((f) => f.id === SCENE)!.name).toBe('Scene 1');
  });

  it('404 for a folder that belongs to a different project of the same org', async () => {
    seedProject();
    db.seed('projects', [{ id: 'proj-2', org_id: ORG_ID, name: 'Other', archived_at: null, created_at: T, updated_at: T }]);
    db.seed('project_folders', [{ id: 'foreign', project_id: 'proj-2', name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T }]);
    expect((await patch('foreign', { name: 'Diner' })).status).toBe(404);
    expect(db.rows('project_folders').find((f) => f.id === 'foreign')!.name).toBe('Scene 1');
  });

  it('404 for an unknown folder', async () => {
    seedProject();
    expect((await patch('missing', { name: 'Diner' })).status).toBe(404);
  });

  it('surfaces an update failure', async () => {
    seedProject();
    db.failNext('project_folders', 'update', 'lock timeout');
    await expect(patch(SCENE, { name: 'Diner' })).rejects.toThrow('renameFolder: lock timeout');
  });
});

describe('DELETE /api/projects/[id]/folders/[folderId]', () => {
  it('401 when signed out, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await del(SCENE);
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('deletes a scene folder and touches the project', async () => {
    seedProject();
    const res = await del(SCENE);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
    expect(db.rows('project_folders').map((f) => f.id)).toEqual([PAPERWORK]);
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('409 for the paperwork folder, which stays put', async () => {
    seedProject();
    const res = await del(PAPERWORK);
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'the paperwork folder cannot be deleted' });
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('404 for another org’s folder — even the paperwork one does not reveal itself as 409', async () => {
    seedProject(OTHER_ORG_ID);
    expect((await del(SCENE)).status).toBe(404);
    expect((await del(PAPERWORK)).status).toBe(404);
    expect(db.rows('project_folders')).toHaveLength(2);
  });

  it('404 for a folder in a different project of the same org', async () => {
    seedProject();
    db.seed('projects', [{ id: 'proj-2', org_id: ORG_ID, name: 'Other', archived_at: null, created_at: T, updated_at: T }]);
    db.seed('project_folders', [{ id: 'foreign', project_id: 'proj-2', name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T }]);
    expect((await del('foreign')).status).toBe(404);
    expect(db.rows('project_folders')).toHaveLength(3);
  });

  it('404 for an unknown folder', async () => {
    seedProject();
    expect((await del('missing')).status).toBe(404);
  });

  it('surfaces a delete failure', async () => {
    seedProject();
    db.failNext('project_folders', 'delete', 'fk violation');
    await expect(del(SCENE)).rejects.toThrow('deleteFolder: fk violation');
  });
});
