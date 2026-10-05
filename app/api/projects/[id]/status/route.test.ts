import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
vi.mock('@/lib/analytics', () => ({ recordEvents: vi.fn(async () => undefined) }));

import { ORG_ID, OTHER_ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { recordEvents } from '@/lib/analytics';
import { PATCH } from './route';

/** The user's own Dashboard status: validated, org-scoped (another org's project reads as 404), and recorded as an event. */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';

function seedProject(orgId = ORG_ID, over: Record<string, unknown> = {}) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', status: 'active', archived_at: null, created_at: T, updated_at: T, ...over }]);
  db.seed('project_folders', [
    { project_id: PROJECT_ID, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const call = (body: unknown, id = PROJECT_ID) =>
  PATCH(jsonRequest(`/api/projects/${id}/status`, body, { method: 'PATCH' }), params({ id }));

beforeEach(() => {
  db.reset();
  signIn();
  vi.mocked(recordEvents).mockClear();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
});

describe('PATCH /api/projects/[id]/status', () => {
  it('401 when signed out, before touching the database', async () => {
    signOut();
    seedProject();
    const res = await call({ status: 'done' });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
    expect(db.rows('projects')[0].status).toBe('active');
  });

  it('400 for a malformed body', async () => {
    seedProject();
    const res = await PATCH(rawRequest(`/api/projects/${PROJECT_ID}/status`, '{nope', { method: 'PATCH' }), params({ id: PROJECT_ID }));
    expect(res.status).toBe(400);
    expect(db.rows('projects')[0].status).toBe('active');
  });

  it.each([[{}], [{ status: 'shipped' }], [{ status: 1 }], [{ status: null }]])(
    '400 for anything outside the vocabulary (%j) and leaves the row alone',
    async (body) => {
      seedProject();
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(db.rows('projects')[0]).toMatchObject({ status: 'active', updated_at: T });
      expect(recordEvents).not.toHaveBeenCalled();
    },
  );

  it('sets the status, bumps updated_at, answers with it and records the event', async () => {
    seedProject();
    const res = await call({ status: 'done' });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, status: 'done' });
    expect(db.rows('projects')[0].status).toBe('done');
    expect(db.rows('projects')[0].updated_at).not.toBe(T);
    expect(recordEvents).toHaveBeenCalledWith({
      orgId: ORG_ID,
      userId: USER_ID,
      type: 'project_status_changed',
      payload: { projectId: PROJECT_ID, status: 'done' },
    });
  });

  it('404 for another org’s project and leaves it untouched', async () => {
    seedProject(OTHER_ORG_ID);
    const res = await call({ status: 'done' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(db.rows('projects')[0]).toMatchObject({ status: 'active', updated_at: T });
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('404 for a project that does not exist', async () => {
    const res = await call({ status: 'pending' }, 'missing');
    expect(res.status).toBe(404);
  });
});
