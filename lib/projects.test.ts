import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approveProject,
  createProject,
  getProject,
  getProjectByShareToken,
  lineTotal,
  listProjects,
  setCoiStatus,
  setProjectArchived,
  setProjectShared,
  suggestPeriods,
  type LineItem,
} from './projects';

/**
 * Two things are covered here and they fail in different ways.
 *
 *   - QUOTE ARITHMETIC is money on a document a production budgets against.
 *     Pure functions, no I/O.
 *   - ORG SCOPING is an access boundary. A missing filter leaks another
 *     organization's jobs, which types cannot catch.
 *
 * The scoping block is an INTEGRATION test against the real database, because
 * that is where the boundary now lives. `lib/projects.ts` uses the service-role
 * client, which bypasses RLS — so the `org_id` filters in its queries are the
 * access control, and a mock would happily agree with a broken one.
 *
 * It creates two throwaway organizations and deletes them afterwards; every
 * child table cascades. It skips when Supabase credentials are absent, so the
 * suite stays green without them rather than failing for the wrong reason.
 */

const line = (quote: LineItem['quote'], qty = 1): LineItem => ({
  itemId: 'i',
  sourceId: 's',
  name: 'Chair',
  qty,
  status: 'available',
  quote,
});

describe('suggestPeriods', () => {
  it('counts calendar days inclusively for a day rate', () => {
    expect(suggestPeriods('day', '2026-08-01', '2026-08-01')).toBe(1);
    expect(suggestPeriods('day', '2026-08-01', '2026-08-05')).toBe(5);
    expect(suggestPeriods('day', '2026-08-01', '2026-08-30')).toBe(30);
  });

  it('rounds part-weeks and part-months up', () => {
    expect(suggestPeriods('week', '2026-08-01', '2026-08-07')).toBe(1);
    expect(suggestPeriods('week', '2026-08-01', '2026-08-08')).toBe(2);
    expect(suggestPeriods('month', '2026-08-01', '2026-08-30')).toBe(1);
  });

  it('pins flat-fee units to a single period', () => {
    expect(suggestPeriods('event', '2026-08-01', '2026-08-30')).toBe(1);
    expect(suggestPeriods('purchase', '2026-08-01', '2026-08-30')).toBe(1);
  });

  it('never yields 0 or NaN on degenerate dates', () => {
    // A zero would silently zero out a line total; NaN would render as "$NaN".
    expect(suggestPeriods('day', '2026-08-30', '2026-08-01')).toBe(1);
    expect(suggestPeriods('day', 'not-a-date', 'nope')).toBe(1);
  });
});

describe('lineTotal', () => {
  it('separates a one-day rental from a thirty-day one', () => {
    // The bug this replaced: both produced the same number.
    const oneDay = lineTotal(line({ amount: 100, unit: 'day', periods: 1, currency: 'USD' }, 2));
    const thirtyDay = lineTotal(line({ amount: 100, unit: 'day', periods: 30, currency: 'USD' }, 2));
    expect(oneDay).toBe(200);
    expect(thirtyDay).toBe(6000);
    expect(oneDay).not.toBe(thirtyDay);
  });

  it('honours a vendor-stated period count over any calendar guess', () => {
    // A "3-day week" is a normal quote; we bill what the vendor said.
    expect(lineTotal(line({ amount: 900, unit: 'week', periods: 3, currency: 'USD' }, 1))).toBe(2700);
  });

  it('multiplies a flat fee by quantity only', () => {
    expect(lineTotal(line({ amount: 500, unit: 'event', periods: 1, currency: 'USD' }, 3))).toBe(1500);
  });

  it('is 0 for an unquoted line rather than NaN', () => {
    expect(lineTotal(line(undefined, 3))).toBe(0);
  });

  it('supports fractional periods, e.g. a half-day', () => {
    expect(lineTotal(line({ amount: 400, unit: 'day', periods: 0.5, currency: 'USD' }, 1))).toBe(200);
  });
});

const HAS_DB = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!HAS_DB)('organization scoping (integration)', () => {
  const ORG_A = crypto.randomUUID();
  const ORG_B = crypto.randomUUID();

  const base = {
    productionName: 'scoping test',
    productionType: 'commercial',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    deliveryAddress: 'a',
    contactName: 'n',
    contactEmail: 'e@example.com',
    contactPhone: 'p',
    lines: [{ itemId: 'i1', sourceId: 's1', source: 'gilandroy' as const, name: 'Chair', qty: 1 }],
  };

  // Imported lazily so the module is not loaded when this suite is skipped.
  async function admin() {
    const { createAdminClient } = await import('./supabase/admin');
    return createAdminClient();
  }

  beforeAll(async () => {
    const c = await admin();
    const { error } = await c.from('organizations').insert([
      { id: ORG_A, type: 'company', name: 'test org A', plan: 'free' },
      { id: ORG_B, type: 'company', name: 'test org B', plan: 'free' },
    ]);
    if (error) throw new Error(`seed orgs: ${error.message}`);
  });

  afterAll(async () => {
    // Cascades through projects -> vendor_requests -> line_items.
    const c = await admin();
    await c.from('organizations').delete().in('id', [ORG_A, ORG_B]);
  });

  it('stamps the owning org and a 16-byte id', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'stamp' });
    expect(p.orgId).toBe(ORG_A);
    expect(p.id).toHaveLength(32);
    // The aggregate comes back whole, not just the parent row.
    expect(p.vendors).toHaveLength(1);
    expect(p.vendors[0].items).toHaveLength(1);
    expect(p.vendors[0].token).toHaveLength(32);
  });

  it('never returns another org’s jobs', async () => {
    await createProject(ORG_A, base);
    await createProject(ORG_B, base);

    const a = await listProjects(ORG_A);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((p) => p.orgId === ORG_A)).toBe(true);
    expect(await listProjects(crypto.randomUUID())).toHaveLength(0);
  });

  it('hides archived jobs unless asked for them', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'archivable' });
    const before = (await listProjects(ORG_A)).length;

    expect(await setProjectArchived(ORG_A, p.id, true)).not.toBeNull();
    expect((await listProjects(ORG_A)).length).toBe(before - 1);
    expect((await listProjects(ORG_A, { includeArchived: true })).length).toBe(before);

    expect(await setProjectArchived(ORG_A, p.id, false)).not.toBeNull();
    expect((await listProjects(ORG_A)).length).toBe(before);
  });

  it('refuses to archive a job belonging to another org', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'not yours' });
    // Reported as not-found rather than forbidden, so this cannot be used to
    // probe which project ids exist.
    expect(await setProjectArchived(ORG_B, p.id, true)).toBeNull();
    expect((await listProjects(ORG_A)).some((x) => x.id === p.id)).toBe(true);
  });

  it('returns null for an unknown id', async () => {
    expect(await setProjectArchived(ORG_A, 'nope', true)).toBeNull();
  });

  /**
   * Approval and COI are the two writes that were reachable without any session
   * at all. They are tested here rather than at the route because the org filter
   * is what actually enforces the boundary — a route check alone would still
   * leave the function callable across orgs by the next caller who forgets.
   */
  it('refuses to approve another org’s proposal, and does not alter it', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'approval' });
    expect(p.status).not.toBe('confirmed');

    expect(await approveProject(ORG_B, p.id)).toBeNull();

    // The point is not just the null return: assert the row is untouched, since
    // "returned null but wrote anyway" is the failure that would matter.
    const after = await getProject(ORG_A, p.id);
    expect(after?.status).toBe(p.status);
    expect(after?.approvedAt).toBeUndefined();

    // ...and the real owner still can.
    expect(await approveProject(ORG_A, p.id)).not.toBeNull();
    expect((await getProject(ORG_A, p.id))?.status).toBe('confirmed');
  });

  it('refuses to set COI status on another org’s vendor, and does not alter it', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'coi' });
    const vendorSource = p.vendors[0].vendor;
    const before = p.vendors[0].coi.status;

    expect(await setCoiStatus(ORG_B, p.id, vendorSource, 'approved', 'http://evil.example')).toBeNull();

    const after = await getProject(ORG_A, p.id);
    expect(after?.vendors[0].coi.status).toBe(before);
    // The cert URL is the part an outsider would most want to write.
    expect(after?.vendors[0].coi.certUrl).toBeUndefined();

    expect(await setCoiStatus(ORG_A, p.id, vendorSource, 'approved')).not.toBeNull();
    expect((await getProject(ORG_A, p.id))?.vendors[0].coi.status).toBe('approved');
  });

  it('returns null rather than throwing for an unknown project id', async () => {
    expect(await approveProject(ORG_A, 'nope')).toBeNull();
    expect(await setCoiStatus(ORG_A, 'nope', 'gilandroy', 'approved')).toBeNull();
  });

  it('hides another org’s project from getProject', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'scoped read' });
    // This read used to be open by design; the share token replaced that.
    expect(await getProject(ORG_B, p.id)).toBeUndefined();
    expect(await getProject(ORG_A, p.id)).toBeDefined();
  });

  /**
   * The share token is a bearer credential handed to someone outside the org, so
   * these run against real rows: the unique constraint, the null semantics and
   * the strip-before-return all live in the database or the mapper, and a mock
   * would agree with a broken version of any of them.
   */
  it('mints a token that resolves, and is absent until asked for', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'shareable' });
    expect(p.shareToken).toBeUndefined(); // lazy: never shared, no credential

    const { ok, shareToken } = await setProjectShared(ORG_A, p.id, true);
    expect(ok).toBe(true);
    expect(shareToken).toHaveLength(32);

    const viaToken = await getProjectByShareToken(shareToken!);
    expect(viaToken?.id).toBe(p.id);
    // The holder already has the token; it must not ride along into a render.
    expect(viaToken?.shareToken).toBeUndefined();
  });

  it('stops resolving the moment it is revoked', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'revocable' });
    const { shareToken } = await setProjectShared(ORG_A, p.id, true);
    expect(await getProjectByShareToken(shareToken!)).toBeDefined();

    await setProjectShared(ORG_A, p.id, false);
    expect(await getProjectByShareToken(shareToken!)).toBeUndefined();
  });

  it('rotates on reissue, so a revoked link cannot come back', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'rotating' });
    const first = (await setProjectShared(ORG_A, p.id, true)).shareToken;
    await setProjectShared(ORG_A, p.id, false);
    const second = (await setProjectShared(ORG_A, p.id, true)).shareToken;

    expect(second).not.toBe(first);
    expect(await getProjectByShareToken(first!)).toBeUndefined();
    expect(await getProjectByShareToken(second!)).toBeDefined();
  });

  it('refuses to share another org’s project', async () => {
    const p = await createProject(ORG_A, { ...base, productionName: 'not yours to share' });
    expect(await setProjectShared(ORG_B, p.id, true)).toEqual({ ok: false, shareToken: null });
    // And nothing was minted behind the failed call.
    expect((await getProject(ORG_A, p.id))?.shareToken).toBeUndefined();
  });

  it('never resolves an empty or unknown token', async () => {
    // Two unshared projects both hold null, so a filter on '' must not match
    // either of them — the case where "many nulls" would become "many matches".
    await createProject(ORG_A, { ...base, productionName: 'null token a' });
    await createProject(ORG_A, { ...base, productionName: 'null token b' });

    expect(await getProjectByShareToken('')).toBeUndefined();
    expect(await getProjectByShareToken('deadbeef'.repeat(4))).toBeUndefined();
  });
});
