import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readJson } from '@/test/helpers/request';
import { READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET } from './route';

/**
 * What the cart reads before the click. It has to agree exactly with what
 * checkout will refuse, and the defaults it shows must be the ones the order
 * would actually get.
 */

// A Wednesday at noon local time: the next business day is Thursday the 3rd.
const NOW = new Date(2026, 8, 2, 12, 0, 0);

function seedOrg(id = ORG_ID, profile: unknown = READY_PROFILE) {
  db.seed('organizations', [{ id, order_profile: profile }]);
}

beforeEach(() => {
  db.reset();
  signIn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

it('401 when signed out, before reading anything', async () => {
  signOut();
  const res = await GET();
  expect(res.status).toBe(401);
  expect(await readJson(res)).toEqual({ error: 'not signed in' });
  expect(db.log).toEqual([]);
});

it('lists every gap and no defaults for an org without a profile', async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await readJson(res)).toEqual({
    ready: false,
    missing: [
      'Company legal name',
      'Ordering contact name',
      'Ordering contact email',
      'Delivery address',
      'Authorization to complete forms',
    ],
    defaults: {},
  });
});

it('is ready with the window, address and notes the order will get', async () => {
  seedOrg(ORG_ID, { ...READY_PROFILE, defaults: { ...READY_PROFILE.defaults, deliveryNotes: 'Stage 4' } });
  expect(await readJson(await GET())).toEqual({
    ready: true,
    missing: [],
    defaults: {
      rentalStart: '2026-09-03',
      rentalEnd: '2026-09-10',
      deliveryAddress: READY_PROFILE.defaults.deliveryAddress,
      deliveryNotes: 'Stage 4',
      rentalWindowDays: 7,
    },
  });
});

it('skips the weekend when picking the start date', async () => {
  vi.setSystemTime(new Date(2026, 8, 4, 12)); // Friday
  seedOrg();
  const { defaults } = await readJson<{ defaults: { rentalStart: string; rentalEnd: string } }>(await GET());
  expect(defaults.rentalStart).toBe('2026-09-07');
  expect(defaults.rentalEnd).toBe('2026-09-14');
});

it('omits an incomplete address from defaults and reports it missing', async () => {
  seedOrg(ORG_ID, { ...READY_PROFILE, defaults: { deliveryAddress: { line1: '1 Stage Rd', city: 'LA' } } });
  expect(await readJson(await GET())).toEqual({
    ready: false,
    missing: ['Delivery address'],
    defaults: {},
  });
});

it('accepts a rental window plus notes in place of a full address', async () => {
  seedOrg(ORG_ID, { ...READY_PROFILE, defaults: { rentalWindowDays: 3, deliveryNotes: 'Will call' } });
  expect(await readJson(await GET())).toEqual({
    ready: true,
    missing: [],
    defaults: { rentalStart: '2026-09-03', rentalEnd: '2026-09-06', deliveryNotes: 'Will call', rentalWindowDays: 3 },
  });
});

it('gives no dates when the profile has no window', async () => {
  seedOrg(ORG_ID, { ...READY_PROFILE, defaults: { deliveryAddress: READY_PROFILE.defaults.deliveryAddress } });
  const body = await readJson<{ ready: boolean; defaults: Record<string, unknown> }>(await GET());
  expect(body.ready).toBe(true);
  expect(body.defaults).toEqual({ deliveryAddress: READY_PROFILE.defaults.deliveryAddress });
});

it('reads only the session org', async () => {
  seedOrg(ORG_ID);
  seedOrg(OTHER_ORG_ID, { ...READY_PROFILE, company: {} });
  signIn({ orgId: OTHER_ORG_ID, userId: 'other-user' });
  const body = await readJson<{ ready: boolean; missing: string[] }>(await GET());
  expect(body).toMatchObject({ ready: false, missing: ['Company legal name'] });
});

it('reports not-ready rather than 500 when the profile read fails', async () => {
  seedOrg();
  db.failNext('organizations', 'select', 'connection reset');
  const res = await GET();
  expect(res.status).toBe(200);
  expect((await readJson<{ ready: boolean }>(res)).ready).toBe(false);
});
