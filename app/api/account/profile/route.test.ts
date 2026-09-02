import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, rawRequest, readJson } from '@/test/helpers/request';
import { READY_PROFILE } from '@/test/fixtures/orders';
import { EMPTY_ORDER_PROFILE, type OrderProfile } from '@/lib/order-profile';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET, PATCH } from './route';

/**
 * The order profile is what makes checkout one click, so the PATCH has two
 * server-owned fields (the COI pointer and the authorization stamp) that the
 * body must never be able to set, and everything else must be normalized
 * before it reaches the jsonb column.
 */

const NOW = '2026-09-02T15:00:00.000Z';
const COI_DOC = { storagePath: `${ORG_ID}/coi/x.pdf`, name: 'x.pdf', uploadedAt: '2026-09-01T00:00:00Z' };
const ALL_MISSING = ['Company legal name', 'Ordering contact name', 'Ordering contact email', 'Delivery address', 'Authorization to complete forms'];

function seedOrg(id = ORG_ID, profile: unknown = READY_PROFILE) {
  return db.seed('organizations', [{ id, order_profile: profile, updated_at: '2026-01-01T00:00:00.000Z' }])[0];
}

function patch(body: unknown) {
  return PATCH(rawRequest('/api/account/profile', JSON.stringify(body), { method: 'PATCH' }));
}

type ProfileResponse = { ok: boolean; profile: OrderProfile; readiness: { ready: boolean; missing: string[] } };

beforeEach(() => {
  db.reset();
  signIn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'not signed in' });
    expect(db.log).toEqual([]);
  });

  it('answers the empty profile and every gap when the org has no row', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      profile: EMPTY_ORDER_PROFILE,
      readiness: { ready: false, missing: ALL_MISSING },
    });
  });

  it('returns the stored profile with readiness', async () => {
    seedOrg();
    expect(await readJson(await GET())).toEqual({
      profile: READY_PROFILE,
      readiness: { ready: true, missing: [] },
    });
  });

  it('normalizes junk that reached the column', async () => {
    seedOrg(ORG_ID, {
      company: { legalName: '  Nocturne  ', entityType: 'partnership', bogus: 1 },
      contacts: { ordering: { name: '', email: 'sam@x.example' } },
      defaults: { rentalWindowDays: '-3' },
      insurance: { glLimit: 'lots' },
      authorization: { formsOnBehalf: 'yes' },
      extra: true,
    });
    const { profile } = await readJson<ProfileResponse>(await GET());
    expect(profile).toEqual({
      company: { legalName: 'Nocturne' },
      contacts: { ordering: { email: 'sam@x.example' } },
      defaults: {},
      insurance: {},
      authorization: { formsOnBehalf: false },
    });
  });

  it('reads only the session org', async () => {
    seedOrg(ORG_ID);
    seedOrg(OTHER_ORG_ID, { ...READY_PROFILE, company: { legalName: 'Other Co' } });
    signIn({ orgId: OTHER_ORG_ID, userId: 'other-user' });
    const { profile } = await readJson<ProfileResponse>(await GET());
    expect(profile.company.legalName).toBe('Other Co');
  });

  it('treats a failed read as an empty profile rather than a 500', async () => {
    seedOrg();
    db.failNext('organizations', 'select', 'connection reset');
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await readJson<ProfileResponse>(res)).profile).toEqual(EMPTY_ORDER_PROFILE);
  });
});

describe('PATCH refusals', () => {
  it('401 when signed out, before reading the body', async () => {
    signOut();
    const res = await patch(READY_PROFILE);
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('400 for malformed JSON', async () => {
    seedOrg();
    const res = await PATCH(rawRequest('/api/account/profile', '{nope', { method: 'PATCH' }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a profile is required' });
    expect(db.rows('organizations')[0].order_profile).toEqual(READY_PROFILE);
  });

  it.each([[null], ['a string'], [42], [true]])('400 when the body is %j', async (body) => {
    seedOrg();
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(db.rows('organizations')[0].order_profile).toEqual(READY_PROFILE);
  });
});

describe('PATCH normalization', () => {
  it('drops unknown keys, wrong types, blanks, and clamps long strings', async () => {
    seedOrg();
    const long = 'x'.repeat(600);
    const res = await patch({
      company: {
        legalName: 123,
        dba: '   ',
        entityType: 'partnership',
        address: { line1: ' 1 Stage Rd ', city: 'LA', state: 'CA', zip: '90028', country: 'US' },
        website: long,
        rogue: 'field',
      },
      contacts: { ordering: { name: 'Sam', email: 'sam@x.example', slack: '@sam' }, accountsPayable: {} },
      defaults: { rentalWindowDays: '7.4', deliveryAddress: 'not an object', deliveryNotes: ' gate 4321 ' },
      insurance: { carrier: 'Acme', glLimit: '1000000', aggregateLimit: -5, additionalInsuredAvailable: 'yes', expiresAt: 5 },
      authorization: { formsOnBehalf: 'true' },
      somethingElse: {},
    });
    expect(res.status).toBe(200);
    const { profile } = await readJson<ProfileResponse>(res);
    expect(profile).toEqual({
      company: {
        address: { line1: '1 Stage Rd', city: 'LA', state: 'CA', zip: '90028' },
        website: 'x'.repeat(500),
      },
      contacts: { ordering: { name: 'Sam', email: 'sam@x.example' } },
      defaults: { rentalWindowDays: 7, deliveryNotes: 'gate 4321' },
      insurance: { carrier: 'Acme', glLimit: 1000000 },
      authorization: { formsOnBehalf: false },
    });
    expect(db.rows('organizations')[0].order_profile).toEqual(profile);
  });

  it('treats an array body as an empty profile', async () => {
    seedOrg();
    const { profile } = await readJson<ProfileResponse>(await patch([]));
    expect(profile).toEqual(EMPTY_ORDER_PROFILE);
  });

  it('replaces rather than merges: fields absent from the body are cleared', async () => {
    seedOrg();
    const { profile } = await readJson<ProfileResponse>(await patch({ company: { legalName: 'Only This' } }));
    expect(profile.contacts).toEqual({});
    expect(profile.defaults).toEqual({});
    expect(db.rows('organizations')[0].order_profile).toEqual(profile);
  });
});

describe('PATCH authorization', () => {
  it('stamps acceptedAt and the session user the first time consent is given, ignoring body stamps', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, authorization: { formsOnBehalf: false } });
    const { profile } = await readJson<ProfileResponse>(
      await patch({
        ...READY_PROFILE,
        authorization: { formsOnBehalf: true, acceptedAt: '1999-01-01T00:00:00Z', acceptedByUserId: 'forged' },
      }),
    );
    expect(profile.authorization).toEqual({ formsOnBehalf: true, acceptedAt: NOW, acceptedByUserId: USER_ID });
  });

  it('keeps the original stamp when consent was already on file', async () => {
    const original = { formsOnBehalf: true, acceptedAt: '2026-08-01T00:00:00.000Z', acceptedByUserId: 'first-user' };
    seedOrg(ORG_ID, { ...READY_PROFILE, authorization: original });
    const { profile } = await readJson<ProfileResponse>(
      await patch({ ...READY_PROFILE, authorization: { formsOnBehalf: true, acceptedAt: NOW, acceptedByUserId: USER_ID } }),
    );
    expect(profile.authorization).toEqual(original);
  });

  it('revoking consent drops the stamp entirely', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, authorization: { formsOnBehalf: true, acceptedAt: NOW, acceptedByUserId: USER_ID } });
    const { profile, readiness } = await readJson<ProfileResponse>(
      await patch({ ...READY_PROFILE, authorization: { formsOnBehalf: false, acceptedAt: NOW } }),
    );
    expect(profile.authorization).toEqual({ formsOnBehalf: false });
    expect(readiness).toEqual({ ready: false, missing: ['Authorization to complete forms'] });
  });

  it('only a literal true grants consent', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, authorization: { formsOnBehalf: false } });
    for (const formsOnBehalf of ['true', 1, 'yes']) {
      const { profile } = await readJson<ProfileResponse>(await patch({ ...READY_PROFILE, authorization: { formsOnBehalf } }));
      expect(profile.authorization).toEqual({ formsOnBehalf: false });
    }
  });
});

describe('PATCH insurance pointer', () => {
  it('keeps the COI on file even when the body omits or replaces it', async () => {
    seedOrg(ORG_ID, { ...READY_PROFILE, insurance: { carrier: 'Old', coiDocument: COI_DOC } });
    const { profile } = await readJson<ProfileResponse>(
      await patch({
        ...READY_PROFILE,
        insurance: { carrier: 'New', coiDocument: { storagePath: `${OTHER_ORG_ID}/coi/steal.pdf`, name: 'steal.pdf', uploadedAt: NOW } },
      }),
    );
    expect(profile.insurance).toEqual({ carrier: 'New', coiDocument: COI_DOC });
  });

  it('cannot invent a COI pointer when none is on file', async () => {
    seedOrg();
    const { profile } = await readJson<ProfileResponse>(
      await patch({ ...READY_PROFILE, insurance: { coiDocument: COI_DOC } }),
    );
    expect(profile.insurance).toEqual({});
    expect('coiDocument' in profile.insurance).toBe(false);
  });
});

describe('PATCH write', () => {
  it('writes the normalized profile to the org row, bumps updated_at, and echoes readiness', async () => {
    const row = seedOrg(ORG_ID, EMPTY_ORDER_PROFILE);
    const res = await patch(READY_PROFILE);
    expect(res.status).toBe(200);
    const body = await readJson<ProfileResponse>(res);
    expect(body.ok).toBe(true);
    expect(body.readiness).toEqual({ ready: true, missing: [] });
    expect(body.profile).toEqual({
      ...READY_PROFILE,
      authorization: { formsOnBehalf: true, acceptedAt: NOW, acceptedByUserId: USER_ID },
    });
    expect(row.order_profile).toEqual(body.profile);
    expect(row.updated_at).toBe(NOW);
    expect(db.log).toEqual([
      { table: 'organizations', op: 'select' },
      { table: 'organizations', op: 'update' },
    ]);
  });

  it('echoes the gaps when the new profile is incomplete', async () => {
    seedOrg();
    const { readiness } = await readJson<ProfileResponse>(await patch({ company: { legalName: 'Nocturne' } }));
    expect(readiness).toEqual({ ready: false, missing: ALL_MISSING.slice(1) });
  });

  it('never touches another org’s row', async () => {
    seedOrg(ORG_ID, EMPTY_ORDER_PROFILE);
    seedOrg(OTHER_ORG_ID);
    await patch({ company: { legalName: 'Mine' } });
    const other = db.rows('organizations').find((r) => r.id === OTHER_ORG_ID)!;
    expect(other.order_profile).toEqual(READY_PROFILE);
    expect(other.updated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('surfaces a failed write instead of answering ok', async () => {
    seedOrg();
    db.failNext('organizations', 'update', { code: '57014', message: 'statement timeout' });
    await expect(patch(READY_PROFILE)).rejects.toMatchObject({ message: 'statement timeout' });
  });

  it('ignores the query string', async () => {
    seedOrg();
    const res = await PATCH(
      new Request(getRequest('/api/account/profile?org=' + OTHER_ORG_ID).url, {
        method: 'PATCH',
        body: JSON.stringify(READY_PROFILE),
      }),
    );
    expect(res.status).toBe(200);
    expect(db.rows('organizations')).toHaveLength(1);
  });
});
