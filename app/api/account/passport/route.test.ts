import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson } from '@/test/helpers/request';
import { READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import type { Passport, PassportSummary } from '@/lib/passport';
import { GET } from './route';

const W9 = {
  storagePath: `${ORG_ID}/passport/w9.pdf`,
  name: 'w9.pdf',
  mime: 'application/pdf',
  uploadedAt: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  db.reset();
  signIn();
});

describe('GET /api/account/passport', () => {
  it('401 when signed out', async () => {
    signOut();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns an empty passport and a zero summary for a new org', async () => {
    db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE, passport: {} }]);
    const body = await readJson<{ passport: Passport; summary: PassportSummary }>(await GET());
    expect(body.passport).toEqual({ documents: {} });
    expect(body.summary).toMatchObject({ onFile: 0, total: 7, expired: [] });
    expect(body.summary.missing).toHaveLength(7);
  });

  it('returns the signed-in org documents only, with the COI from the order profile', async () => {
    db.seed('organizations', [
      {
        id: ORG_ID,
        order_profile: {
          ...READY_PROFILE,
          insurance: {
            coiDocument: { storagePath: `${ORG_ID}/coi/c.pdf`, name: 'c.pdf', uploadedAt: W9.uploadedAt },
            expiresAt: '2020-01-01',
          },
        },
        passport: { documents: { w9: W9 } },
      },
      {
        id: OTHER_ORG_ID,
        order_profile: READY_PROFILE,
        passport: { documents: { voided_check: { ...W9, name: 'other.pdf' } } },
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson<{ passport: Passport; summary: PassportSummary }>(res);
    expect(Object.keys(body.passport.documents).sort()).toEqual(['coi', 'w9']);
    expect(body.summary.onFile).toBe(2);
    expect(body.summary.expired).toEqual(['Certificate of insurance']);
  });
});
