import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READY_PROFILE } from '@/test/fixtures/orders';
import { ORG_ID, OTHER_ORG_ID, USER_ID } from '@/test/mocks/session';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { db } from '@/test/mocks/supabase-admin';
import {
  getPassport,
  passportDownloadUrl,
  patchPassportDocument,
  removePassportDocument,
  storePassportDocument,
} from './passport-store';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const W9 = {
  storagePath: `${ORG_ID}/passport/w9.pdf`,
  name: 'w9.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
};

const LICENSE = {
  storagePath: `${ORG_ID}/passport/license.pdf`,
  name: 'license.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
  expiresAt: '2030-01-01',
  reference: 'D1234567',
};

const COI = { storagePath: `${ORG_ID}/coi/coi.pdf`, name: 'coi.pdf', uploadedAt: '2026-09-01T00:00:00Z' };

function bytes(n = 16) {
  return new Uint8Array(n).fill(1);
}

function seedOrg(passport: unknown = {}, profile: unknown = READY_PROFILE, id = ORG_ID) {
  db.seed('organizations', [{ id, order_profile: profile, passport }]);
}

function org(id = ORG_ID) {
  return db.rows('organizations').find((r) => r.id === id) as {
    passport: { documents: Record<string, unknown> };
    order_profile: { insurance: Record<string, unknown> };
  };
}

beforeEach(() => {
  db.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPassport', () => {
  it('is empty for an org with no row', async () => {
    expect(await getPassport(ORG_ID)).toEqual({ documents: {} });
  });

  it('returns only the asking org documents and folds in its COI', async () => {
    seedOrg({ documents: { w9: W9 } }, { ...READY_PROFILE, insurance: { coiDocument: COI, policyNumber: 'GL-1' } });
    seedOrg(
      { documents: { voided_check: { ...W9, storagePath: `${OTHER_ORG_ID}/passport/check.pdf` } } },
      READY_PROFILE,
      OTHER_ORG_ID,
    );
    const passport = await getPassport(ORG_ID);
    expect(Object.keys(passport.documents).sort()).toEqual(['coi', 'w9']);
    expect(passport.documents.coi).toMatchObject({ name: 'coi.pdf', reference: 'GL-1' });
  });

  it('drops a coi stored on the passport column in favor of the order profile', async () => {
    seedOrg({ documents: { coi: { ...W9, name: 'stray.pdf' } } });
    expect((await getPassport(ORG_ID)).documents).toEqual({});
  });
});

describe('storePassportDocument', () => {
  it('accepts an office file for a slot that allows one and omits uploader when unknown', async () => {
    seedOrg();
    const res = await storePassportDocument(ORG_ID, 'w9', { name: 'w9.docx', mime: DOCX, bytes: bytes() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.document.storagePath).toMatch(new RegExp(`^${ORG_ID}/passport/.+\\.docx$`));
    expect(res.document).not.toHaveProperty('uploadedByUserId');
    expect(org().passport.documents.w9).toEqual(res.document);
  });

  it('keeps the prior expiry and reference when a document is replaced', async () => {
    seedOrg({ documents: { drivers_license: LICENSE, w9: W9 } });
    const res = await storePassportDocument(
      ORG_ID,
      'drivers_license',
      { name: 'new.png', mime: 'image/png', bytes: bytes() },
      USER_ID,
    );
    expect(res).toMatchObject({
      ok: true,
      document: { name: 'new.png', expiresAt: '2030-01-01', reference: 'D1234567', uploadedByUserId: USER_ID },
    });
    expect(org().passport.documents.w9).toEqual(W9);
  });

  it('refuses a file type the paperwork bucket does not take', async () => {
    seedOrg();
    const res = await storePassportDocument(ORG_ID, 'w9', { name: 'run.exe', mime: 'application/x-msdownload', bytes: bytes() });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.buckets.size).toBe(0);
  });

  it('stores a coi on the order profile, not the passport column', async () => {
    seedOrg();
    const res = await storePassportDocument(ORG_ID, 'coi', { name: 'coi.pdf', mime: 'application/pdf', bytes: bytes() });
    expect(res).toMatchObject({ ok: true, document: { name: 'coi.pdf', mime: 'application/pdf' } });
    expect(org().order_profile.insurance.coiDocument).toMatchObject({ name: 'coi.pdf' });
    expect(org().passport.documents ?? {}).not.toHaveProperty('coi');
  });

  it('passes a coi refusal through', async () => {
    seedOrg();
    const res = await storePassportDocument(ORG_ID, 'coi', { name: 'coi.docx', mime: DOCX, bytes: bytes() });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(org().order_profile.insurance).toEqual({});
  });

  it('returns a generic error when storage refuses the upload, and logs the detail', async () => {
    seedOrg({ documents: { w9: W9 } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failNextStorage('upload', 'bucket missing');
    const res = await storePassportDocument(ORG_ID, 'w9', { name: 'w9.pdf', mime: 'application/pdf', bytes: bytes() });
    expect(res).toEqual({ ok: false, status: 500, error: 'upload failed' });
    expect(log).toHaveBeenCalledWith('[passport] upload failed', expect.objectContaining({ message: 'bucket missing' }));
    expect(org().passport.documents).toEqual({ w9: W9 });
  });

  it('does not wipe the passport when the read before the write fails', async () => {
    seedOrg({ documents: { w9: W9 } });
    db.failNext('organizations', 'select', 'timeout');
    await expect(
      storePassportDocument(ORG_ID, 'drivers_license', { name: 'dl.pdf', mime: 'application/pdf', bytes: bytes() }),
    ).rejects.toThrow('timeout');
    expect(org().passport.documents).toEqual({ w9: W9 });
    expect(db.bucket('paperwork').size).toBe(0);
  });

  it('throws when the passport write fails', async () => {
    seedOrg();
    db.failNext('organizations', 'update', 'write refused');
    await expect(
      storePassportDocument(ORG_ID, 'w9', { name: 'w9.pdf', mime: 'application/pdf', bytes: bytes() }),
    ).rejects.toMatchObject({ message: 'write refused' });
  });
});

describe('patchPassportDocument', () => {
  it('returns null for an empty slot without writing', async () => {
    seedOrg();
    expect(await patchPassportDocument(ORG_ID, 'w9', { reference: 'x' })).toBeNull();
    expect(await patchPassportDocument(ORG_ID, 'coi', { reference: 'x' })).toBeNull();
    expect(org().passport).toEqual({});
  });

  it('sets expiry and reference on a stored slot', async () => {
    seedOrg({ documents: { business_license: W9 } });
    const doc = await patchPassportDocument(ORG_ID, 'business_license', {
      expiresAt: '2027-06-01',
      reference: 'BL-7',
    });
    expect(doc).toEqual({ ...W9, expiresAt: '2027-06-01', reference: 'BL-7' });
    expect(org().passport.documents.business_license).toEqual(doc);
  });

  it('clears a stored expiry and reference left blank', async () => {
    seedOrg({ documents: { drivers_license: LICENSE } });
    const doc = await patchPassportDocument(ORG_ID, 'drivers_license', {});
    const bare = { storagePath: LICENSE.storagePath, name: LICENSE.name, mime: LICENSE.mime, uploadedAt: LICENSE.uploadedAt };
    expect(doc).toEqual(bare);
    expect(org().passport.documents.drivers_license).toEqual(bare);
  });

  it('does not wipe the order profile when the read before a coi patch fails', async () => {
    const profile = { ...READY_PROFILE, insurance: { carrier: 'Acme', coiDocument: COI, policyNumber: 'GL-1' } };
    seedOrg({}, profile);
    db.failNext('organizations', 'select', 'timeout');
    await expect(patchPassportDocument(ORG_ID, 'coi', {})).rejects.toThrow('timeout');
    expect(org().order_profile).toEqual(profile);
  });

  it('does not wipe the passport when the read before a patch fails', async () => {
    seedOrg({ documents: { drivers_license: LICENSE, w9: W9 } });
    db.failNext('organizations', 'select', 'timeout');
    await expect(patchPassportDocument(ORG_ID, 'drivers_license', {})).rejects.toThrow('timeout');
    expect(org().passport.documents).toEqual({ drivers_license: LICENSE, w9: W9 });
  });

  it('clears coi expiry and policy number left blank and keeps the certificate', async () => {
    seedOrg({}, {
      ...READY_PROFILE,
      insurance: { carrier: 'Acme', coiDocument: COI, expiresAt: '2027-01-01', policyNumber: 'GL-1' },
    });
    const doc = await patchPassportDocument(ORG_ID, 'coi', {});
    expect(doc).toMatchObject({ name: 'coi.pdf' });
    expect(doc?.expiresAt).toBeUndefined();
    expect(org().order_profile.insurance).toEqual({ carrier: 'Acme', coiDocument: COI });
  });
});

describe('removePassportDocument', () => {
  it('drops only the named slot', async () => {
    seedOrg({ documents: { w9: W9, drivers_license: LICENSE } });
    await removePassportDocument(ORG_ID, 'w9');
    expect(org().passport.documents).toEqual({ drivers_license: LICENSE });
  });

  it('drops the coi pointer from the order profile and keeps the rest', async () => {
    seedOrg({}, { ...READY_PROFILE, insurance: { carrier: 'Acme', coiDocument: COI } });
    await removePassportDocument(ORG_ID, 'coi');
    expect(org().order_profile).toEqual({ ...READY_PROFILE, insurance: { carrier: 'Acme' } });
  });

  it('does not wipe the order profile when the read before removing the coi fails', async () => {
    const profile = { ...READY_PROFILE, insurance: { carrier: 'Acme', coiDocument: COI } };
    seedOrg({}, profile);
    db.failNext('organizations', 'select', 'timeout');
    await expect(removePassportDocument(ORG_ID, 'coi')).rejects.toThrow('timeout');
    expect(org().order_profile).toEqual(profile);
  });

  it('does not wipe the passport when the read before removing a slot fails', async () => {
    seedOrg({ documents: { w9: W9, drivers_license: LICENSE } });
    db.failNext('organizations', 'select', 'timeout');
    await expect(removePassportDocument(ORG_ID, 'w9')).rejects.toThrow('timeout');
    expect(org().passport.documents).toEqual({ w9: W9, drivers_license: LICENSE });
  });
});

describe('passportDownloadUrl', () => {
  it('signs the stored object with its file name', async () => {
    seedOrg({ documents: { w9: W9 } });
    db.bucket('paperwork').set(W9.storagePath, { bytes: bytes(1) });
    const res = await passportDownloadUrl(ORG_ID, 'w9');
    expect(res?.name).toBe('w9.pdf');
    expect(res?.url).toContain(W9.storagePath);
  });

  it('is null for an empty slot and for a missing coi', async () => {
    seedOrg();
    expect(await passportDownloadUrl(ORG_ID, 'w9')).toBeNull();
    expect(await passportDownloadUrl(ORG_ID, 'coi')).toBeNull();
  });

  it('signs the coi from the order profile', async () => {
    seedOrg({}, { ...READY_PROFILE, insurance: { coiDocument: COI } });
    db.bucket('paperwork').set(COI.storagePath, { bytes: bytes(1) });
    expect(await passportDownloadUrl(ORG_ID, 'coi')).toMatchObject({ name: 'coi.pdf' });
  });

  it('throws when storage cannot sign', async () => {
    seedOrg({ documents: { w9: W9 } });
    db.failNextStorage('createSignedUrl', 'storage down');
    await expect(passportDownloadUrl(ORG_ID, 'w9')).rejects.toThrow('storage down');
  });
});
