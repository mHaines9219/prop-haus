import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

const T = '2026-09-01T00:00:00.000Z';
const P = 'proj-1';

function seedProject(org = ORG_ID) {
  db.seed('projects', [{ id: P, org_id: org, name: 'Nocturne', created_at: T, updated_at: T, archived_at: null, profile: {} }]);
  db.seed('project_folders', [
    { id: `${P}-scene`, project_id: P, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: `${P}-paper`, project_id: P, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const post = (body: unknown) => POST(jsonRequest(`/api/projects/${P}/intake`, body), params({ id: P }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.relation('project_documents', 'project_requirements', 'document_id');
  process.env.INTAKE_PROVIDER = 'mock';
});

describe('POST /api/projects/[id]/intake', () => {
  it('400 on a missing or malformed message, before the session', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ message: '   ' })).status).toBe(400);
    expect((await POST(rawRequest(`/api/projects/${P}/intake`, 'nope'), params({ id: P }))).status).toBe(400);
    expect(db.log).toEqual([]);
  });

  it('401 signed out, 404 for another org’s project', async () => {
    signOut();
    expect((await post({ message: 'A film' })).status).toBe(401);
    signIn();
    seedProject(OTHER_ORG_ID);
    expect((await post({ message: 'A film' })).status).toBe(404);
    expect(db.rows('project_intake_messages')).toHaveLength(0);
  });

  it('runs the turn and answers with the reply, profile, questions, and checklist', async () => {
    seedProject();
    const res = await post({ message: 'A 3-day commercial in Los Angeles with 8 crew, renting props from two vendors.' });
    expect(res.status).toBe(200);
    const body = await readJson<{ reply: string; profile: { productionType: string }; questions: Array<{ key: string }>; checklist: { items: Array<{ requirementId: string }> }; provider: string }>(res);
    expect(body.provider).toBe('mock');
    expect(body.profile.productionType).toBe('commercial');
    expect(body.reply).toContain('Noted');
    expect(body.questions[0].key).toBe('cast.minors');
    expect(body.checklist.items.map((i) => i.requirementId)).toContain('prop_inventory_condition_log');
    expect(db.rows('projects')[0].profile).toMatchObject({ productionType: 'commercial', crew: { count: 8 } });
  });
});
