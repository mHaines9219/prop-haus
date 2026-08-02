import { describe, expect, it } from 'vitest';
import { createProbeUser, deleteProbeUser, withProbeUser } from './auth-probe';
import { createAdminClient } from './supabase/admin';

/**
 * Integration only — this helper exists to get a live database right, so a mock
 * would be testing the thing it cannot get wrong. Skips without credentials.
 *
 * The assertion that matters is the last one: after cleanup, the ORGANIZATION is
 * gone too. Deleting the user alone leaves it behind, which is what happened
 * three times in one afternoon.
 */

const HAS_DB = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Creating a real auth user is several round trips to the auth admin API and
 * takes ~2s on its own. Vitest's 5s default left almost no headroom, and these
 * tests were passing on luck: adding database-bound tests elsewhere in the suite
 * was enough to tip two of them into a timeout while the code under test was
 * fine. A slow network call deserves a stated budget rather than an inherited
 * one — a timeout that trips under unrelated load reports the wrong failure.
 */
const AUTH_API_TIMEOUT = 30_000;

async function counts(orgId: string, userId: string) {
  const db = createAdminClient();
  const [org, profile, membership] = await Promise.all([
    db.from('organizations').select('id', { count: 'exact', head: true }).eq('id', orgId),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId),
    db.from('memberships').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return { org: org.count ?? 0, profile: profile.count ?? 0, membership: membership.count ?? 0 };
}

describe.skipIf(!HAS_DB)('auth probe lifecycle (integration)', () => {
  it('creates a user and the trigger gives it an org, profile and membership', async () => {
    const probe = await createProbeUser('lifecycle');
    try {
      const c = await counts(probe.orgId, probe.userId);
      // Also the only direct evidence handle_new_user() runs.
      expect(c).toEqual({ org: 1, profile: 1, membership: 1 });
      expect(probe.email).toContain('@example.invalid');
    } finally {
      await deleteProbeUser(probe);
    }
  }, AUTH_API_TIMEOUT);

  it('cleanup removes the ORGANIZATION, not just the user', async () => {
    const probe = await createProbeUser('cleanup');
    await deleteProbeUser(probe);

    const c = await counts(probe.orgId, probe.userId);
    expect(c).toEqual({ org: 0, profile: 0, membership: 0 });
  }, AUTH_API_TIMEOUT);

  it('withProbeUser cleans up even when the body throws', async () => {
    let captured: { orgId: string; userId: string } | null = null;

    await expect(
      withProbeUser('throwing', async (p) => {
        captured = { orgId: p.orgId, userId: p.userId };
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(captured).not.toBeNull();
    expect(await counts(captured!.orgId, captured!.userId)).toEqual({
      org: 0,
      profile: 0,
      membership: 0,
    });
  }, AUTH_API_TIMEOUT);

  it('no probe organizations are left anywhere in the database', async () => {
    // Deliberately global rather than scoped to this run. The recurring failure
    // is orphaned orgs from ad-hoc probe scripts, and a check scoped to its own
    // rows would pass while the database filled up — which is exactly what it
    // did. On its first run this caught three orgs left by an earlier script of
    // mine that deleted the users and not the organizations.
    //
    // If this fails, some probe left rows behind: delete the users first, then
    // the orgs (profiles.org_id is NO ACTION, so the reverse order 409s).
    const db = createAdminClient();
    const { data } = await db.from('organizations').select('id, name');
    const strays = (data ?? [])
      .filter((o) => /^probe-/.test(String(o.name)))
      .map((o) => `${o.id} (${o.name})`);
    expect(strays, 'orphaned probe organizations — see the comment above').toEqual([]);
  });
});
