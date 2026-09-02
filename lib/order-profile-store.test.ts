import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READY_PROFILE } from '@/test/fixtures/orders';

/**
 * The profile column is jsonb and the COI is an object in a private bucket.
 * These tests pin the read fallback, the write shape, what a COI upload
 * accepts, and that a stored COI is pointed at from the profile.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { EMPTY_ORDER_PROFILE, type OrderProfile } from './order-profile';
import { coiDownloadUrl, getOrderProfile, storeCoiDocument, updateOrderProfile } from './order-profile-store';

const PROFILE: OrderProfile = { ...READY_PROFILE, insurance: { carrier: 'Hiscox', glLimit: 1_000_000 } };
const PDF = { name: 'coi.pdf', mime: 'application/pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) };

function seedOrg(profile: unknown = PROFILE, id = ORG_ID) {
  db.seed('organizations', [{ id, order_profile: profile, updated_at: '2026-01-01T00:00:00.000Z' }]);
}

function orgProfile(id = ORG_ID): OrderProfile {
  return db.rows('organizations').find((r) => r.id === id)!.order_profile as OrderProfile;
}

beforeEach(() => {
  db.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getOrderProfile', () => {
  it('returns the stored profile, normalized', async () => {
    seedOrg({ ...PROFILE, extra: 'dropped', company: { legalName: '  Nocturne Pictures LLC ', bogus: 1 } });
    const p = await getOrderProfile(ORG_ID);
    expect(p).toEqual({ ...PROFILE, company: { legalName: 'Nocturne Pictures LLC' } });
  });

  it('is the empty profile when the org has no row', async () => {
    await expect(getOrderProfile(ORG_ID)).resolves.toEqual(EMPTY_ORDER_PROFILE);
  });

  it('is the empty profile when the column is null', async () => {
    seedOrg(null);
    await expect(getOrderProfile(ORG_ID)).resolves.toEqual(EMPTY_ORDER_PROFILE);
  });

  it('falls back to the empty profile on a read failure', async () => {
    seedOrg();
    db.failNext('organizations', 'select', 'timeout');
    await expect(getOrderProfile(ORG_ID)).resolves.toEqual(EMPTY_ORDER_PROFILE);
  });

  it('never reads another org’s profile', async () => {
    seedOrg(PROFILE, OTHER_ORG_ID);
    await expect(getOrderProfile(ORG_ID)).resolves.toEqual(EMPTY_ORDER_PROFILE);
  });
});

describe('updateOrderProfile', () => {
  it('writes the profile and bumps updated_at on that org only', async () => {
    seedOrg(EMPTY_ORDER_PROFILE);
    seedOrg(EMPTY_ORDER_PROFILE, OTHER_ORG_ID);
    await updateOrderProfile(ORG_ID, PROFILE);
    const mine = db.rows('organizations').find((r) => r.id === ORG_ID)!;
    expect(mine.order_profile).toEqual(PROFILE);
    expect(mine.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
    expect(orgProfile(OTHER_ORG_ID)).toEqual(EMPTY_ORDER_PROFILE);
  });

  it('resolves without a row to update', async () => {
    await expect(updateOrderProfile(ORG_ID, PROFILE)).resolves.toBeUndefined();
  });

  it('rethrows a write failure', async () => {
    seedOrg();
    db.failNext('organizations', 'update', { code: '42501', message: 'permission denied' });
    await expect(updateOrderProfile(ORG_ID, PROFILE)).rejects.toMatchObject({ message: 'permission denied' });
  });
});

describe('storeCoiDocument', () => {
  beforeEach(() => seedOrg());

  it('refuses a nameless file before touching storage', async () => {
    await expect(storeCoiDocument(ORG_ID, { ...PDF, name: '   ' })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'The file needs a name.',
    });
    expect(db.buckets.size).toBe(0);
  });

  it('refuses an empty file', async () => {
    await expect(storeCoiDocument(ORG_ID, { ...PDF, bytes: new Uint8Array() })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'coi.pdf is empty.',
    });
  });

  it('refuses a type the paperwork folder would not take', async () => {
    const r = await storeCoiDocument(ORG_ID, { name: 'coi.zip', mime: 'application/zip', bytes: new Uint8Array([1]) });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect((r as { error: string }).error).toMatch(/supported type/);
  });

  it.each([
    ['budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['notes.txt', 'text/plain'],
    ['memo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('refuses %s: a certificate is a PDF or an image', async (name, mime) => {
    await expect(storeCoiDocument(ORG_ID, { name, mime, bytes: new Uint8Array([1]) })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Upload the certificate as a PDF or an image.',
    });
    expect(db.buckets.size).toBe(0);
    expect(orgProfile().insurance.coiDocument).toBeUndefined();
  });

  it('stores a PDF under the org prefix and points the profile at it', async () => {
    const r = await storeCoiDocument(ORG_ID, PDF);
    expect(r.ok).toBe(true);
    const { document } = r as { ok: true; document: { storagePath: string; name: string; uploadedAt: string } };
    expect(document.storagePath).toMatch(new RegExp(`^${ORG_ID}/coi/[0-9a-f-]{36}\\.pdf$`));
    expect(document.name).toBe('coi.pdf');
    expect(Date.parse(document.uploadedAt)).not.toBeNaN();

    const obj = db.bucket('paperwork').get(document.storagePath);
    expect(obj?.contentType).toBe('application/pdf');
    expect(obj?.bytes).toEqual(PDF.bytes);

    const stored = orgProfile();
    expect(stored.insurance).toEqual({ carrier: 'Hiscox', glLimit: 1_000_000, coiDocument: document });
    expect(stored.company).toEqual(PROFILE.company);
    expect(stored.authorization).toEqual(PROFILE.authorization);
  });

  it('accepts an image and infers the type from the extension when the browser sends none', async () => {
    const jpg = await storeCoiDocument(ORG_ID, { name: 'coi.JPG', mime: 'image/jpeg', bytes: new Uint8Array([1]) });
    expect(jpg).toMatchObject({ ok: true, document: { name: 'coi.JPG' } });
    expect((jpg as { document: { storagePath: string } }).document.storagePath).toMatch(/\.jpg$/);

    const png = await storeCoiDocument(ORG_ID, { name: 'coi.png', mime: '', bytes: new Uint8Array([1]) });
    expect((png as { document: { storagePath: string } }).document.storagePath).toMatch(/\.png$/);
    expect(db.bucket('paperwork').size).toBe(2);
  });

  it('a replacement leaves the old object in place and repoints the profile', async () => {
    const first = (await storeCoiDocument(ORG_ID, PDF)) as { document: { storagePath: string } };
    const second = (await storeCoiDocument(ORG_ID, { ...PDF, name: 'renewed.pdf' })) as { document: { storagePath: string } };
    expect(db.bucket('paperwork').has(first.document.storagePath)).toBe(true);
    expect(orgProfile().insurance.coiDocument).toMatchObject({ storagePath: second.document.storagePath, name: 'renewed.pdf' });
  });

  it('honours PAPERWORK_BUCKET', async () => {
    vi.stubEnv('PAPERWORK_BUCKET', 'docs-staging');
    await storeCoiDocument(ORG_ID, PDF);
    expect(db.bucket('docs-staging').size).toBe(1);
    expect(db.buckets.has('paperwork')).toBe(false);
  });

  it('is a 500 when storage refuses, and the profile is untouched', async () => {
    db.failNextStorage('upload', 'bucket full');
    await expect(storeCoiDocument(ORG_ID, PDF)).resolves.toEqual({ ok: false, status: 500, error: 'upload failed: bucket full' });
    expect(orgProfile().insurance.coiDocument).toBeUndefined();
    expect(db.log.some((l) => l.table === 'organizations' && l.op === 'update')).toBe(false);
  });

  it('rethrows when the profile pointer cannot be written', async () => {
    db.failNext('organizations', 'update', 'boom');
    await expect(storeCoiDocument(ORG_ID, PDF)).rejects.toMatchObject({ message: 'boom' });
  });

  // Observed: getOrderProfile swallows the read error and returns EMPTY, so the
  // pointer write replaces the whole profile with an empty one plus the COI.
  it.fails('does not wipe the profile when the read before the pointer write fails', async () => {
    db.failNext('organizations', 'select', 'timeout');
    await storeCoiDocument(ORG_ID, PDF).catch(() => undefined);
    expect(orgProfile().company.legalName).toBe('Nocturne Pictures LLC');
  });
});

describe('coiDownloadUrl', () => {
  it('is null without an org row or without a COI on file', async () => {
    await expect(coiDownloadUrl(ORG_ID)).resolves.toBeNull();
    seedOrg();
    await expect(coiDownloadUrl(ORG_ID)).resolves.toBeNull();
    expect(db.signedUrls).toEqual([]);
  });

  it('signs a short-lived download link named after the file', async () => {
    seedOrg();
    const { document } = (await storeCoiDocument(ORG_ID, PDF)) as { document: { storagePath: string } };
    await expect(coiDownloadUrl(ORG_ID)).resolves.toEqual({
      url: expect.stringContaining(`${document.storagePath}?`),
      name: 'coi.pdf',
    });
    expect(db.signedUrls).toEqual([
      { bucket: 'paperwork', path: document.storagePath, expiresIn: 60, options: { download: 'coi.pdf' } },
    ]);
  });

  it('throws when the profile points at an object that is gone', async () => {
    seedOrg({ ...PROFILE, insurance: { coiDocument: { storagePath: `${ORG_ID}/coi/gone.pdf`, name: 'coi.pdf', uploadedAt: '2026-09-01T00:00:00Z' } } });
    await expect(coiDownloadUrl(ORG_ID)).rejects.toThrow('coiDownloadUrl: Object not found');
  });

  it('throws when signing fails', async () => {
    seedOrg();
    await storeCoiDocument(ORG_ID, PDF);
    db.failNextStorage('createSignedUrl', 'signing key rotated');
    await expect(coiDownloadUrl(ORG_ID)).rejects.toThrow('coiDownloadUrl: signing key rotated');
  });
});
