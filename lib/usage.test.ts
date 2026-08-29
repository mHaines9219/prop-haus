import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A paywall that miscounts is the whole failure. Types cannot show any of this:
 * a counter that double-charges, one that never charges, one that leaks another
 * org's usage, or a lost update under concurrency that hands out free searches.
 *
 * lib/usage.ts talks to Postgres through lib/supabase/admin.ts, so it is mocked
 * here with an in-memory fake that mirrors the real schema: `usage_counters`
 * keyed on (org_id, period, metric), and an `increment_usage_counter` RPC that
 * does the same atomic upsert as the migration
 * (supabase/migrations/20260829120000_usage_counter_daily_rpc.sql). This proves
 * lib/usage.ts calls the right shape correctly; it cannot prove Postgres itself
 * is atomic under real concurrent connections — that guarantee is the SQL
 * `on conflict ... do update set count = count + 1`, reviewed in the migration,
 * not something a single-process JS mock can exercise.
 */

const counters = new Map<string, number>();
const key = (orgId: string, period: string, metric: string) => `${orgId}::${period}::${metric}`;

vi.mock('./supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'usage_counters') throw new Error(`unmocked table: ${table}`);
      const filters: Record<string, string> = {};
      return {
        select: () => ({
          eq(col: string, val: string) {
            filters[col] = val;
            return this;
          },
          async maybeSingle() {
            const count = counters.get(key(filters.org_id, filters.period, filters.metric));
            return { data: count === undefined ? null : { count }, error: null };
          },
        }),
      };
    },
    async rpc(fn: string, args: { p_org_id: string; p_period: string; p_metric: string }) {
      if (fn !== 'increment_usage_counter') throw new Error(`unmocked rpc: ${fn}`);
      const k = key(args.p_org_id, args.p_period, args.p_metric);
      const next = (counters.get(k) ?? 0) + 1;
      counters.set(k, next);
      return { data: next, error: null };
    },
  }),
}));

const PLAN = 'free' as const;
const AI = 'aiSearchesPerDay' as const;
const VISION = 'visionSearches' as const;
const ORG = 'org-a';

let U: typeof import('./usage');

beforeEach(async () => {
  counters.clear();
  vi.resetModules();
  U = await import('./usage');
});

describe('getAllowance', () => {
  it('starts at zero used and reports the plan ceiling', async () => {
    const a = await U.getAllowance(ORG, PLAN, AI);
    expect(a.used).toBe(0);
    expect(a.limit).toBe(5);
    expect(a.remaining).toBe(5);
    expect(a.allowed).toBe(true);
  });

  it('never consumes — checking is free', async () => {
    // The zero-result search path calls this instead of recordUsage, so if it
    // consumed, every failed search would still be billed.
    for (let i = 0; i < 5; i++) await U.getAllowance(ORG, PLAN, AI);
    expect((await U.getAllowance(ORG, PLAN, AI)).used).toBe(0);
  });
});

describe('recordUsage', () => {
  it('consumes one and returns the standing after', async () => {
    expect((await U.recordUsage(ORG, PLAN, AI)).used).toBe(1);
    expect((await U.recordUsage(ORG, PLAN, AI)).used).toBe(2);
    expect((await U.getAllowance(ORG, PLAN, AI)).remaining).toBe(3);
  });

  it('closes the gate exactly at the limit, not one past it', async () => {
    for (let i = 0; i < 5; i++) await U.recordUsage(ORG, PLAN, AI);
    const a = await U.getAllowance(ORG, PLAN, AI);
    expect(a.used).toBe(5);
    expect(a.remaining).toBe(0);
    expect(a.allowed).toBe(false);
  });

  it('counts every write under concurrency', async () => {
    // Backed by the atomic upsert RPC: without it, ten simultaneous
    // read-modify-writes on the same row could collapse to fewer than ten.
    await Promise.all(Array.from({ length: 10 }, () => U.recordUsage(ORG, PLAN, AI)));
    expect((await U.getAllowance(ORG, PLAN, AI)).used).toBe(10);
  });
});

describe('isolation between metrics, orgs and periods', () => {
  it('keeps vision and text allowances separate', async () => {
    await U.recordUsage(ORG, PLAN, AI);
    expect((await U.getAllowance(ORG, PLAN, VISION)).used).toBe(0);
    expect((await U.getAllowance(ORG, PLAN, VISION)).limit).toBe(3);
  });

  it('never lets one org’s usage touch another’s', async () => {
    await U.recordUsage('org-a', PLAN, AI);
    await U.recordUsage('org-a', PLAN, AI);
    await U.recordUsage('org-b', PLAN, AI);
    expect((await U.getAllowance('org-a', PLAN, AI)).used).toBe(2);
    expect((await U.getAllowance('org-b', PLAN, AI)).used).toBe(1);
    expect((await U.getAllowance('org-c', PLAN, AI)).used).toBe(0);
  });

  it('resets the daily metric across a day boundary', async () => {
    const day1 = new Date('2026-08-15T23:00:00Z');
    const day2 = new Date('2026-08-16T01:00:00Z');
    await U.recordUsage(ORG, PLAN, AI, day1);
    expect((await U.getAllowance(ORG, PLAN, AI, day1)).used).toBe(1);
    expect((await U.getAllowance(ORG, PLAN, AI, day2)).used).toBe(0);
  });

  it('does NOT reset the lifetime metric across a day boundary', async () => {
    const day1 = new Date('2026-08-15T23:00:00Z');
    const day2 = new Date('2026-08-16T01:00:00Z');
    await U.recordUsage(ORG, PLAN, VISION, day1);
    // visionSearches is a lifetime trial — a new day must not refill it.
    expect((await U.getAllowance(ORG, PLAN, VISION, day2)).used).toBe(1);
  });
});

describe('paid plans', () => {
  it('get a higher daily ceiling than free, not unlimited', async () => {
    const a = await U.getAllowance(ORG, 'pro', AI);
    expect(a.limit).toBe(10);
    expect(a.remaining).toBe(10);
    expect(a.allowed).toBe(true);
  });

  it('closes the gate at 10', async () => {
    for (let i = 0; i < 10; i++) await U.recordUsage(ORG, 'pro', AI);
    const a = await U.getAllowance(ORG, 'pro', AI);
    expect(a.used).toBe(10);
    expect(a.remaining).toBe(0);
    expect(a.allowed).toBe(false);
  });
});

describe('usageSnapshot', () => {
  it('reports both metrics in one read', async () => {
    await U.recordUsage(ORG, PLAN, AI);
    const snap = await U.usageSnapshot(ORG, PLAN);
    expect(snap.aiSearchesPerDay.used).toBe(1);
    expect(snap.visionSearches.used).toBe(0);
  });
});
