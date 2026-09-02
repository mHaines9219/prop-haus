import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

/** Archive / restore is org-scoped: another org's project reads as 404, never 403. */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';

function seedProject(orgId = ORG_ID, over: Record<string, unknown> = {}) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', archived_at: null, created_at: T, updated_at: T, ...over }]);
  db.seed('project_folders', [
    { project_id: PROJECT_ID, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const call = (body: unknown, id = PROJECT_ID) => POST(jsonRequest(`/api/projects/${id}/archive`, body), params({ id }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
});

describe('POST /api/projects/[id]/archive', () => {
  it('401 when signed out, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await call({ archived: true });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
    expect(db.rows('projects')[0].archived_at).toBeNull();
  });

  it('rejects a malformed JSON body rather than archiving', async () => {
    seedProject();
    await expect(POST(rawRequest(`/api/projects/${PROJECT_ID}/archive`, '{nope'), params({ id: PROJECT_ID }))).rejects.toThrow();
    expect(db.rows('projects')[0].archived_at).toBeNull();
  });

  it('archives the project and answers with the timestamp', async () => {
    seedProject();
    const res = await call({ archived: true });
    expect(res.status).toBe(200);
    const body = await readJson<{ ok: boolean; archivedAt: string | null }>(res);
    expect(body.ok).toBe(true);
    expect(body.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(db.rows('projects')[0]).toMatchObject({ archived_at: body.archivedAt });
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
  });

  it('restores an archived project when archived is false', async () => {
    seedProject(ORG_ID, { archived_at: T });
    const res = await call({ archived: false });
    expect(await readJson(res)).toEqual({ ok: true, archivedAt: null });
    expect(db.rows('projects')[0].archived_at).toBeNull();
  });

  it.each([[{}], [{ archived: 'true' }], [{ archived: 1 }], [{ archived: null }]])(
    'treats anything but boolean true (%j) as restore',
    async (body) => {
      seedProject(ORG_ID, { archived_at: T });
      await call(body);
      expect(db.rows('projects')[0].archived_at).toBeNull();
    },
  );

  it('404 for another org’s project and leaves it untouched', async () => {
    seedProject(OTHER_ORG_ID);
    const res = await call({ archived: true });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(db.rows('projects')[0]).toMatchObject({ archived_at: null, updated_at: T });
  });

  it('404 for a project that does not exist', async () => {
    const res = await call({ archived: true }, 'missing');
    expect(res.status).toBe(404);
  });

  it('surfaces an update failure', async () => {
    seedProject();
    db.failNext('projects', 'update', 'lock timeout');
    await expect(call({ archived: true })).rejects.toThrow('setProjectArchived: lock timeout');
  });
});
