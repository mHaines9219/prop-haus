import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fileOf, formRequest, getRequest, jsonRequest, params, readJson } from '@/test/helpers/request';
import { READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { DELETE, GET, PATCH, POST } from './route';

const W9 = {
  storagePath: `${ORG_ID}/passport/existing.pdf`,
  name: 'existing.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
  reference: 'old',
};

function seedOrg(passport: unknown = {}, profile: unknown = READY_PROFILE) {
  db.seed('organizations', [{ id: ORG_ID, order_profile: profile, passport }]);
}

function org() {
  return db.rows('organizations').find((r) => r.id === ORG_ID) as {
    passport: { documents: Record<string, unknown> };
    order_profile: { insurance: Record<string, unknown> };
  };
}

function upload(kind: string, file: File) {
  const form = new FormData();
  form.set('file', file);
  return POST(formRequest(`/api/account/passport/${kind}`, form), params({ kind }));
}

beforeEach(() => {
  db.reset();
  signIn();
});

describe('guards', () => {
  it('401 when signed out', async () => {
    signOut();
    const res = await upload('w9', fileOf('w9.pdf', 'application/pdf', 16));
    expect(res.status).toBe(401);
    expect(db.buckets.size).toBe(0);
  });

  it('404 for an unknown kind on every verb', async () => {
    seedOrg();
    const ctx = params({ kind: 'passport_photo' });
    expect((await upload('passport_photo', fileOf('x.pdf', 'application/pdf', 16))).status).toBe(404);
    expect((await GET(getRequest('/api/account/passport/passport_photo'), ctx)).status).toBe(404);
    expect((await PATCH(jsonRequest('/api/account/passport/passport_photo', {}), ctx)).status).toBe(404);
    expect((await DELETE(getRequest('/api/account/passport/passport_photo'), ctx)).status).toBe(404);
  });

  it('400 when there is no file', async () => {
    seedOrg();
    const res = await POST(formRequest('/api/account/passport/w9', new FormData()), params({ kind: 'w9' }));
    expect(res.status).toBe(400);
  });

  it('400 when an ID slot gets a spreadsheet', async () => {
    seedOrg();
    const res = await upload('drivers_license', fileOf('id.xlsx', 'application/vnd.ms-excel', 16));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Upload this document as a PDF or an image.' });
    expect(db.buckets.size).toBe(0);
  });
});

describe('POST', () => {
  it('stores under the org prefix, stamps the uploader, and keeps the prior reference', async () => {
    seedOrg({ documents: { w9: W9 } });
    const res = await upload('w9', fileOf('new.pdf', 'application/pdf', 16));
    expect(res.status).toBe(200);
    const { document } = await readJson<{ document: typeof W9 & { uploadedByUserId: string } }>(res);
    expect(document.storagePath).toMatch(new RegExp(`^${ORG_ID}/passport/[0-9a-f-]+\\.pdf$`));
    expect(document.name).toBe('new.pdf');
    expect(document.uploadedByUserId).toBe(USER_ID);
    expect(document.reference).toBe('old');
    expect(org().passport.documents.w9).toEqual(document);
    expect(db.buckets.get('paperwork')?.has(document.storagePath)).toBe(true);
  });

  it('routes the coi kind to the order profile', async () => {
    seedOrg();
    const res = await upload('coi', fileOf('coi.pdf', 'application/pdf', 16));
    expect(res.status).toBe(200);
    const { document } = await readJson<{ document: { storagePath: string } }>(res);
    expect(document.storagePath).toMatch(new RegExp(`^${ORG_ID}/coi/`));
    expect(org().order_profile.insurance.coiDocument).toMatchObject({ name: 'coi.pdf' });
    expect(org().passport.documents ?? {}).not.toHaveProperty('coi');
  });

  it('500 when storage refuses the upload', async () => {
    seedOrg();
    db.failNextStorage('upload', 'bucket offline');
    const res = await upload('w9', fileOf('w9.pdf', 'application/pdf', 16));
    expect(res.status).toBe(500);
  });
});

describe('GET', () => {
  it('redirects to a signed URL for the slot', async () => {
    seedOrg({ documents: { w9: W9 } });
    db.bucket('paperwork').set(W9.storagePath, { bytes: new Uint8Array(1) });
    const res = await GET(getRequest('/api/account/passport/w9'), params({ kind: 'w9' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(W9.storagePath);
  });

  it('404 when the slot is empty', async () => {
    seedOrg();
    const res = await GET(getRequest('/api/account/passport/w9'), params({ kind: 'w9' }));
    expect(res.status).toBe(404);
  });
});

describe('PATCH', () => {
  it('updates expiry and reference, clearing the ones left blank', async () => {
    seedOrg({ documents: { w9: W9 } });
    const res = await PATCH(
      jsonRequest('/api/account/passport/w9', { expiresAt: '2027-01-01', reference: '' }),
      params({ kind: 'w9' }),
    );
    expect(res.status).toBe(200);
    expect(org().passport.documents.w9).toEqual({ ...W9, reference: undefined, expiresAt: '2027-01-01' });
    expect(org().passport.documents.w9).not.toHaveProperty('reference');
  });

  it('writes coi metadata to the insurance block', async () => {
    seedOrg({}, {
      ...READY_PROFILE,
      insurance: { coiDocument: { storagePath: `${ORG_ID}/coi/x.pdf`, name: 'x.pdf', uploadedAt: W9.uploadedAt } },
    });
    const res = await PATCH(
      jsonRequest('/api/account/passport/coi', { expiresAt: '2027-03-01', reference: 'GL-9' }),
      params({ kind: 'coi' }),
    );
    expect(res.status).toBe(200);
    expect(org().order_profile.insurance).toMatchObject({ expiresAt: '2027-03-01', policyNumber: 'GL-9' });
  });

  it('404 when the slot is empty and 400 without a body', async () => {
    seedOrg();
    const ctx = params({ kind: 'w9' });
    expect((await PATCH(jsonRequest('/api/account/passport/w9', { reference: 'x' }), ctx)).status).toBe(404);
    expect((await PATCH(getRequest('/api/account/passport/w9', { method: 'PATCH' }), ctx)).status).toBe(400);
  });
});

describe('DELETE', () => {
  it('drops the slot pointer and leaves the object in the bucket', async () => {
    seedOrg({ documents: { w9: W9 } });
    const res = await DELETE(getRequest('/api/account/passport/w9'), params({ kind: 'w9' }));
    expect(res.status).toBe(200);
    expect(org().passport.documents).toEqual({});
  });

  it('clears the order profile certificate for the coi kind', async () => {
    seedOrg({}, {
      ...READY_PROFILE,
      insurance: { carrier: 'Acme', coiDocument: { storagePath: 'p', name: 'x.pdf', uploadedAt: W9.uploadedAt } },
    });
    const res = await DELETE(getRequest('/api/account/passport/coi'), params({ kind: 'coi' }));
    expect(res.status).toBe(200);
    expect(org().order_profile.insurance).toEqual({ carrier: 'Acme' });
  });
});
