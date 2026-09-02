import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fileOf, formRequest, jsonRequest, params, rawRequest, readJson } from '@/test/helpers/request';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

const T = '2026-09-01T00:00:00.000Z';
const P = 'proj-1';

function seedProject(org = ORG_ID, profile: Record<string, unknown> = { cast: { minors: true }, crew: { count: 4 } }) {
  db.seed('projects', [{ id: P, org_id: org, name: 'Nocturne', created_at: T, updated_at: T, archived_at: null, profile }]);
  db.seed('project_folders', [
    { id: `${P}-scene`, project_id: P, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: `${P}-paper`, project_id: P, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

const url = (req: string) => `/api/projects/${P}/requirements/${req}`;
const act = (requirementId: string, body: unknown) => POST(jsonRequest(url(requirementId), body), params({ id: P, requirementId }));
function upload(requirementId: string, file: File | null, init: RequestInit = {}) {
  const form = new FormData();
  if (file) form.append('file', file);
  return POST(formRequest(url(requirementId), form, init), params({ id: P, requirementId }));
}

type Body = { ok?: true; checklist?: { items: Array<{ requirementId: string; status: string }> }; missing?: string[]; error?: string };
const statusOf = (body: Body, id: string) => body.checklist?.items.find((i) => i.requirementId === id)?.status;

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.relation('project_documents', 'project_requirements', 'document_id');
  db.unique('project_requirements', ['project_id', 'requirement_id']);
  process.env.FORMS_PROVIDER = 'mock';
});

describe('POST /api/projects/[id]/requirements/[requirementId]', () => {
  it('401 signed out before touching anything; 400 for an unknown action', async () => {
    signOut();
    expect((await act('minor_release', { action: 'request' })).status).toBe(401);
    expect(db.log).toEqual([]);
    signIn();
    expect((await act('minor_release', { action: 'burn' })).status).toBe(400);
    expect((await POST(rawRequest(url('minor_release'), 'nope'), params({ id: P, requirementId: 'minor_release' }))).status).toBe(400);
  });

  it('404 for another org’s project and for an unknown requirement', async () => {
    seedProject(OTHER_ORG_ID);
    expect((await act('minor_release', { action: 'not_applicable' })).status).toBe(404);
    db.reset();
    seedProject();
    expect((await act('no_such_thing', { action: 'not_applicable' })).status).toBe(404);
    expect(db.rows('project_requirements')).toHaveLength(0);
  });

  it('marks requested, not applicable, and undoes', async () => {
    seedProject();
    let body = await readJson<Body>(await act('minor_work_permit', { action: 'request' }));
    expect(statusOf(body, 'minor_work_permit')).toBe('awaiting');
    body = await readJson<Body>(await act('minor_work_permit', { action: 'not_applicable' }));
    expect(statusOf(body, 'minor_work_permit')).toBe('not_applicable');
    body = await readJson<Body>(await act('minor_work_permit', { action: 'reset' }));
    expect(statusOf(body, 'minor_work_permit')).toBe('missing');
  });

  it('uses the template: a prefilled PDF lands in the paperwork folder and the row is complete, blanks named', async () => {
    seedProject();
    const res = await act('crew_emergency_contact', { action: 'use_template' });
    expect(res.status).toBe(200);
    const body = await readJson<Body>(res);
    expect(statusOf(body, 'crew_emergency_contact')).toBe('complete');
    expect(body.missing).toEqual(['production_company', 'contact_name', 'contact_email']);
    expect(db.rows('project_documents')[0]).toMatchObject({ name: 'crew_emergency_contact.pdf', folder_id: `${P}-paper` });
  });

  it('404 when the requirement has no template', async () => {
    seedProject();
    const res = await act('minor_work_permit', { action: 'use_template' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'no template for this requirement' });
  });

  it('attaches an upload, and refuses oversize or missing files before storage', async () => {
    seedProject();
    expect((await upload('minor_release', null)).status).toBe(400);
    expect((await upload('minor_release', fileOf('a.pdf', 'application/pdf', 3), { headers: { 'content-length': String(MAX_PAPERWORK_BYTES * 2) } })).status).toBe(413);
    expect(db.bucket('paperwork').size).toBe(0);

    const res = await upload('minor_release', fileOf('release.pdf', 'application/pdf', 3));
    expect(res.status).toBe(200);
    const body = await readJson<Body>(res);
    expect(statusOf(body, 'minor_release')).toBe('complete');
    expect(db.bucket('paperwork').size).toBe(1);
    expect(db.rows('project_requirements')[0]).toMatchObject({ requirement_id: 'minor_release', status: 'attached' });
  });
});
