import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson } from '@/test/helpers/request';
import { usagePeriod } from '@/lib/plans';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET } from './route';

/**
 * "12 of 20 left". Read-only, scoped to the session org, and the ceiling comes
 * from the plan on the session rather than anything stored.
 */

const THIS_WEEK = usagePeriod('free', 'aiSearches');
const TODAY = usagePeriod('pro', 'aiSearches');

function counter(orgId: string, metric: string, count: number, period = metric === 'visionSearches' ? 'lifetime' : THIS_WEEK) {
  return { org_id: orgId, period, metric, count };
}

type Snapshot = {
  plan: string;
  metrics: Record<'visionSearches' | 'aiSearches', { metric: string; period: string; window: string; used: number; limit: number | null; remaining: number | null; allowed: boolean }>;
};

beforeEach(() => {
  db.reset();
  signIn();
});

it('401 when signed out, before reading anything', async () => {
  signOut();
  const res = await GET();
  expect(res.status).toBe(401);
  expect(await readJson(res)).toEqual({ error: 'not signed in' });
  expect(db.log).toEqual([]);
});

it('reports a fresh free org at zero with the plan ceilings', async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await readJson(res)).toEqual({
    plan: 'free',
    metrics: {
      visionSearches: { metric: 'visionSearches', period: 'lifetime', window: 'lifetime', used: 0, limit: 3, remaining: 3, allowed: true },
      aiSearches: { metric: 'aiSearches', period: THIS_WEEK, window: 'week', used: 0, limit: 3, remaining: 3, allowed: true },
    },
  });
});

it('reads this week’s counter and the lifetime counter for the session org only', async () => {
  db.seed('usage_counters', [
    counter(ORG_ID, 'aiSearches', 2),
    counter(ORG_ID, 'aiSearches', 5, '2020-W01'),
    counter(ORG_ID, 'visionSearches', 1),
    counter(OTHER_ORG_ID, 'aiSearches', 5),
    counter(OTHER_ORG_ID, 'visionSearches', 3),
  ]);
  const { metrics } = await readJson<Snapshot>(await GET());
  expect(metrics.aiSearches).toMatchObject({ used: 2, remaining: 1, allowed: true });
  expect(metrics.visionSearches).toMatchObject({ used: 1, remaining: 2, allowed: true });
});

it('closes the gate at the limit and never reports negative remaining', async () => {
  db.seed('usage_counters', [counter(ORG_ID, 'aiSearches', 3), counter(ORG_ID, 'visionSearches', 9)]);
  const { metrics } = await readJson<Snapshot>(await GET());
  expect(metrics.aiSearches).toMatchObject({ used: 3, remaining: 0, allowed: false });
  expect(metrics.visionSearches).toMatchObject({ used: 9, remaining: 0, allowed: false });
});

it('applies the pro ceilings from the session plan', async () => {
  signIn({ plan: 'pro' });
  // Pro counts by the day, so its row lives under today's key, not this week's.
  db.seed('usage_counters', [counter(ORG_ID, 'visionSearches', 50), counter(ORG_ID, 'aiSearches', 2, TODAY)]);
  const body = await readJson<Snapshot>(await GET());
  expect(body.plan).toBe('pro');
  expect(body.metrics.visionSearches).toMatchObject({ used: 50, limit: null, remaining: null, allowed: true });
  expect(body.metrics.aiSearches).toMatchObject({ used: 2, limit: 5, remaining: 3, allowed: true, window: 'day' });
});

it('never consumes: only selects, no rpc, no writes', async () => {
  db.rpc('increment_usage_counter', () => {
    throw new Error('must not be called');
  });
  await GET();
  await GET();
  expect(db.log).toHaveLength(4);
  expect(db.log.every((l) => l.table === 'usage_counters' && l.op === 'select')).toBe(true);
});

it('sets no cache header: standing is per-org and live', async () => {
  const res = await GET();
  expect(res.headers.get('cache-control')).toBeNull();
});

it('surfaces a failed read rather than reporting zero usage', async () => {
  db.failNext('usage_counters', 'select', { code: '57014', message: 'statement timeout' });
  await expect(GET()).rejects.toMatchObject({ message: 'statement timeout' });
});

describe('period', () => {
  it('uses the ISO week on free and the UTC day on pro', async () => {
    const { metrics } = await readJson<Snapshot>(await GET());
    expect(metrics.aiSearches.period).toMatch(/^\d{4}-W\d{2}$/);
    signIn({ plan: 'pro' });
    const pro = await readJson<Snapshot>(await GET());
    expect(pro.metrics.aiSearches.period).toBe(new Date().toISOString().slice(0, 10));
  });
});
