import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formRequest, fileOf, rawRequest, readJson } from '@/test/helpers/request';
import { READY_PROFILE } from '@/test/fixtures/orders';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET, POST } from './route';

/**
 * The COI upload is the one multipart route on the account: it must refuse
 * before touching storage, store under the org's own prefix, and hand back a
 * signed URL only for the org that owns the certificate.
 */

const COI_DOC = { storagePath: `${ORG_ID}/coi/existing.pdf`, name: 'existing.pdf', uploadedAt: '2026-09-01T00:00:00Z' };

function seedOrg(id = ORG_ID, profile: unknown = READY_PROFILE) {
  db.seed('organizations', [{ id, order_profile: profile }]);
}

function upload(file: File | string) {
  const form = new FormData();
  form.set('file', file);
  return POST(formRequest('/api/account/insurance/coi', form));
}

beforeEach(() => {
  db.reset();
  signIn();
});

describe('POST refusals', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await upload(fileOf('coi.pdf', 'application/pdf', 16));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
    expect(db.buckets.size).toBe(0);
  });

  it('413 from the declared content-length alone, without reading the body', async () => {
    const form = new FormData();
    form.set('file', fileOf('coi.pdf', 'application/pdf', 16));
    const res = await POST(
      formRequest('/api/account/insurance/coi', form, {
        headers: { 'content-length': String(MAX_PAPERWORK_BYTES + 64 * 1024 + 1) },
      }),
    );
    expect(res.status).toBe(413);
    expect(await readJson(res)).toEqual({ error: 'file is too large' });
    expect(db.log).toEqual([]);
  });

  it('400 when the body is not multipart at all', async () => {
    const res = await POST(rawRequest('/api/account/insurance/coi', '{"file":"x"}'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a file is required' });
  });

  it('400 when the form has no file field', async () => {
    const form = new FormData();
    form.set('other', 'x');
    const res = await POST(formRequest('/api/account/insurance/coi', form));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a file is required' });
  });

  it('400 when file is a string field rather than a File', async () => {
    const res = await upload('not a file');
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a file is required' });
  });

  it('400 for an empty file', async () => {
    seedOrg();
    const res = await upload(fileOf('coi.pdf', 'application/pdf', 0));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'coi.pdf is empty.' });
    expect(db.bucket('paperwork').size).toBe(0);
  });

  it('400 for a file over the byte cap even when content-length is honest', async () => {
    seedOrg();
    const res = await upload(fileOf('coi.pdf', 'application/pdf', MAX_PAPERWORK_BYTES + 1));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'coi.pdf is too large (max 20 MB).' });
    expect(db.bucket('paperwork').size).toBe(0);
  });

  it('400 for a mime the paperwork layer does not know', async () => {
    seedOrg();
    const res = await upload(fileOf('coi.zip', 'application/zip', 16));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({
      error: 'coi.zip isn’t a supported type. Upload a PDF, image, or Office document.',
    });
  });

  it('400 for paperwork types that are not a certificate (csv, docx)', async () => {
    seedOrg();
    for (const [name, mime] of [
      ['coi.csv', 'text/csv'],
      ['coi.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ]) {
      const res = await upload(fileOf(name, mime, 16));
      expect(res.status).toBe(400);
      expect(await readJson(res)).toEqual({ error: 'Upload the certificate as a PDF or an image.' });
    }
    expect(db.bucket('paperwork').size).toBe(0);
    expect(db.rows('organizations')[0].order_profile).toEqual(READY_PROFILE);
  });

  it('500 when storage refuses the upload, and leaves the profile untouched', async () => {
    seedOrg();
    db.failNextStorage('upload', 'bucket offline');
    const res = await upload(fileOf('coi.pdf', 'application/pdf', 16));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'upload failed: bucket offline' });
    expect(db.bucket('paperwork').size).toBe(0);
    expect(db.rows('organizations')[0].order_profile).toEqual(READY_PROFILE);
  });
});

describe('POST success', () => {
  it('stores the bytes under <orgId>/coi/ and points the profile at them', async () => {
    seedOrg();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const res = await upload(fileOf('My COI.pdf', 'application/pdf', bytes));
    expect(res.status).toBe(200);
    const body = await readJson<{ ok: boolean; document: { storagePath: string; name: string; uploadedAt: string } }>(res);

    expect(body.ok).toBe(true);
    expect(body.document.storagePath).toMatch(
      new RegExp(`^${ORG_ID}/coi/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(body.document.name).toBe('My COI.pdf');
    expect(body.document.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const stored = db.bucket('paperwork').get(body.document.storagePath);
    expect(stored).toBeDefined();
    expect(Array.from(stored!.bytes)).toEqual(Array.from(bytes));
    expect(stored!.contentType).toBe('application/pdf');

    const profile = db.rows('organizations')[0].order_profile as typeof READY_PROFILE;
    expect(profile).toEqual({ ...READY_PROFILE, insurance: { coiDocument: body.document } });
  });

  it('accepts an image and keeps the extension for the mime', async () => {
    seedOrg();
    const res = await upload(fileOf('photo.jpg', 'image/jpeg', 16));
    expect(res.status).toBe(200);
    const { document } = await readJson<{ document: { storagePath: string } }>(res);
    expect(document.storagePath).toMatch(/\.jpg$/);
    expect(db.bucket('paperwork').get(document.storagePath)?.contentType).toBe('image/jpeg');
  });

  it('infers the mime from the extension when the browser sends none', async () => {
    seedOrg();
    const res = await upload(fileOf('coi.png', '', 16));
    expect(res.status).toBe(200);
    const { document } = await readJson<{ document: { storagePath: string } }>(res);
    expect(db.bucket('paperwork').get(document.storagePath)?.contentType).toBe('image/png');
  });

  it('replacing a COI overwrites the pointer and leaves the old object in the bucket', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, insurance: { carrier: 'Acme', coiDocument: COI_DOC } });
    db.bucket('paperwork').set(COI_DOC.storagePath, { bytes: new Uint8Array(1) });
    const res = await upload(fileOf('renewed.pdf', 'application/pdf', 16));
    const { document } = await readJson<{ document: { storagePath: string } }>(res);
    expect(db.bucket('paperwork').size).toBe(2);
    expect(db.bucket('paperwork').has(COI_DOC.storagePath)).toBe(true);
    expect(db.rows('organizations')[0].order_profile).toMatchObject({
      insurance: { carrier: 'Acme', coiDocument: expect.objectContaining({ storagePath: document.storagePath, name: 'renewed.pdf' }) },
    });
  });

  it('writes only the session org, never another org with the same body', async () => {
    seedOrg(ORG_ID);
    seedOrg(OTHER_ORG_ID);
    await upload(fileOf('coi.pdf', 'application/pdf', 16));
    const other = db.rows('organizations').find((r) => r.id === OTHER_ORG_ID)!;
    expect(other.order_profile).toEqual(READY_PROFILE);
    for (const path of db.bucket('paperwork').keys()) expect(path.startsWith(`${ORG_ID}/coi/`)).toBe(true);
  });
});

describe('GET', () => {
  it('401 when signed out', async () => {
    signOut();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('404 when nothing is on file', async () => {
    seedOrg();
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'no certificate on file' });
    expect(db.signedUrls).toEqual([]);
  });

  it('302 to a short-lived signed download URL that is never cached', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, insurance: { coiDocument: COI_DOC } });
    db.bucket('paperwork').set(COI_DOC.storagePath, { bytes: new Uint8Array(1), contentType: 'application/pdf' });
    const res = await GET();
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('location')).toBe(
      `https://fake.storage/paperwork/${COI_DOC.storagePath}?token=fake&expires=60&download=existing.pdf`,
    );
    expect(db.signedUrls).toEqual([
      { bucket: 'paperwork', path: COI_DOC.storagePath, expiresIn: 60, options: { download: 'existing.pdf' } },
    ]);
  });

  it('never serves another org’s certificate', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, insurance: { coiDocument: COI_DOC } });
    db.bucket('paperwork').set(COI_DOC.storagePath, { bytes: new Uint8Array(1) });
    seedOrg(OTHER_ORG_ID);
    signIn({ orgId: OTHER_ORG_ID, userId: 'other-user' });
    const res = await GET();
    expect(res.status).toBe(404);
    expect(db.signedUrls).toEqual([]);
  });

  it('throws when storage cannot sign, rather than redirecting nowhere', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, insurance: { coiDocument: COI_DOC } });
    db.failNextStorage('createSignedUrl', 'signing key rotated');
    await expect(GET()).rejects.toThrow('coiDownloadUrl: signing key rotated');
  });
});
