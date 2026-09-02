import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { PATCH } from './route';

const T = '2026-09-01T00:00:00.000Z';
const P = 'proj-1';

function seedProject(org = ORG_ID, profile: Record<string, unknown> = {}) {
  db.seed('projects', [{ id: P, org_id: org, name: 'Nocturne', created_at: T, updated_at: T, archived_at: null, profile }]);
  db.seed('project_folders', [
    { id: `${P}-scene`, project_id: P, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: `${P}-paper`, project_id: P, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const patch = (body: unknown) => PATCH(jsonRequest(`/api/projects/${P}/profile`, body, { method: 'PATCH' }), params({ id: P }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.relation('project_documents', 'project_requirements', 'document_id');
});

describe('PATCH /api/projects/[id]/profile', () => {
  it('400 on a non-object body, 401 signed out, 404 for another org', async () => {
    expect((await PATCH(rawRequest(`/api/projects/${P}/profile`, '[]', { method: 'PATCH' }), params({ id: P }))).status).toBe(400);
    signOut();
    expect((await patch({ crew: { count: 2 } })).status).toBe(401);
    signIn();
    seedProject(OTHER_ORG_ID);
    expect((await patch({ crew: { count: 2 } })).status).toBe(404);
  });

  it('merges a normalized patch into the stored profile and returns the re-evaluated checklist', async () => {
    seedProject(ORG_ID, { productionType: 'film', crew: { count: 10 } });
    const res = await patch({ crew: { count: 12 }, cast: { minors: true }, bogus: 1 });
    expect(res.status).toBe(200);
    const body = await readJson<{ profile: unknown; facts: Array<{ label: string }>; questions: unknown[]; checklist: { items: Array<{ requirementId: string }> } }>(res);
    expect(body.profile).toEqual({ productionType: 'film', crew: { count: 12 }, cast: { minors: true } });
    expect(db.rows('projects')[0].profile).toEqual(body.profile);
    expect(body.facts.map((f) => f.label)).toEqual(['Type', 'Crew', 'Minors']);
    expect(body.checklist.items.map((i) => i.requirementId)).toContain('minor_release');
    expect(body.questions).toHaveLength(3);
  });
});
