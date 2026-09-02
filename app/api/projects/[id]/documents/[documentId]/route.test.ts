import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, params, readJson } from '@/test/helpers/request';
import { PAPERWORK_SIGNED_URL_SECONDS } from '@/lib/paperwork';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET } from './route';

/** Downloads redirect to a short-lived signed URL, minted only after the org check. */

const T = '2026-09-01T10:00:00.000Z';
const PROJECT_ID = 'proj-1';
const PAPERWORK = 'folder-paperwork';
const BUCKET = 'paperwork';

function seedProject(orgId = ORG_ID) {
  db.seed('projects', [{ id: PROJECT_ID, org_id: orgId, name: 'Night Shoot', archived_at: null, created_at: T, updated_at: T }]);
  db.seed('project_folders', [
    { id: PAPERWORK, project_id: PROJECT_ID, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

function seedDocument(id: string, name = `${id}.pdf`, projectId = PROJECT_ID) {
  const path = `${ORG_ID}/${projectId}/${id}.pdf`;
  db.seed('project_documents', [
    { id, project_id: projectId, folder_id: PAPERWORK, name, storage_path: path, mime: 'application/pdf', size_bytes: 3, uploaded_at: T },
  ]);
  db.bucket(BUCKET).set(path, { bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' });
  return path;
}

const get = (documentId: string, id = PROJECT_ID) =>
  GET(getRequest(`/api/projects/${id}/documents/${documentId}`), params({ id, documentId }));

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
});

describe('GET /api/projects/[id]/documents/[documentId]', () => {
  it('401 when signed out, before touching the database or minting a URL', async () => {
    signOut();
    seedProject();
    seedDocument('doc-1');
    const res = await get('doc-1');
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
    expect(db.signedUrls).toEqual([]);
  });

  it('302s to a signed URL that forces a download under the display name', async () => {
    seedProject();
    const path = seedDocument('doc-1', 'COI 2026.pdf');
    const res = await get('doc-1');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      `https://fake.storage/${BUCKET}/${path}?token=fake&expires=${PAPERWORK_SIGNED_URL_SECONDS}&download=COI+2026.pdf`,
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(db.signedUrls).toEqual([
      { bucket: BUCKET, path, expiresIn: PAPERWORK_SIGNED_URL_SECONDS, options: { download: 'COI 2026.pdf' } },
    ]);
  });

  it('404 for another org’s document, and mints nothing', async () => {
    seedProject(OTHER_ORG_ID);
    seedDocument('doc-1');
    const res = await get('doc-1');
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(db.signedUrls).toEqual([]);
  });

  it('404 for a document filed under a different project of the same org', async () => {
    seedProject();
    db.seed('projects', [{ id: 'proj-2', org_id: ORG_ID, name: 'Other', archived_at: null, created_at: T, updated_at: T }]);
    seedDocument('doc-1', 'x.pdf', 'proj-2');
    expect((await get('doc-1')).status).toBe(404);
    expect(db.signedUrls).toEqual([]);
  });

  it('404 for an unknown document or project', async () => {
    seedProject();
    expect((await get('missing')).status).toBe(404);
    expect((await get('missing', 'nope')).status).toBe(404);
  });

  it('surfaces a signing failure rather than redirecting nowhere', async () => {
    seedProject();
    seedDocument('doc-1');
    db.failNextStorage('createSignedUrl', 'storage unavailable');
    await expect(get('doc-1')).rejects.toThrow('documentDownloadUrl: storage unavailable');
  });

  it('surfaces a missing object as an error, not a 404 that hides a dangling row', async () => {
    seedProject();
    const path = seedDocument('doc-1');
    db.bucket(BUCKET).delete(path);
    await expect(get('doc-1')).rejects.toThrow('documentDownloadUrl: Object not found');
  });

  it('surfaces a read failure', async () => {
    seedProject();
    seedDocument('doc-1');
    db.failNext('project_documents', 'select', 'connection reset');
    await expect(get('doc-1')).rejects.toThrow('documentDownloadUrl.read: connection reset');
  });
});
