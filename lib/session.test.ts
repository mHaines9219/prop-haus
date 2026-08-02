import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The behaviour worth testing here is what happens when the answer is *not* a
 * clean session: signed out, a profile row that cannot be read, or a plan value
 * we do not recognise. Each has a safe direction and an unsafe one, and nothing
 * in the type system picks the safe one for you.
 *
 * Failing open would mean rendering an owned page with no owner, or handing a
 * paid tier to somebody who has not got one.
 *
 * (This file previously asserted that PLACEHOLDER_ORG_ID matched its seed
 * migration. That constant is gone now that sessions are real; the seed row and
 * its migration stay, harmlessly, since they may own dev-era events.)
 */

type ProfileRow = { org_id: string | null; organizations: unknown } | null;

function mockSupabase(opts: {
  user: { id: string } | null;
  profile?: ProfileRow;
  profileError?: boolean;
  /** Row present AND error set — the shape that exercises the `error ||` guard. */
  profileErrorWithRow?: boolean;
}) {
  vi.doMock('./supabase/server', () => ({
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: opts.user }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.profileError ? null : (opts.profile ?? null),
              error:
                opts.profileError || opts.profileErrorWithRow ? { message: 'boom' } : null,
            }),
          }),
        }),
      }),
    }),
  }));
}

// Re-imported per test: currentSession is wrapped in React cache(), so a fresh
// module is the cleanest way to avoid one case's result answering the next.
async function load() {
  return import('./session');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('./supabase/server');
});

describe('signed out', () => {
  beforeEach(() => mockSupabase({ user: null }));

  it('has no session and no org', async () => {
    const s = await load();
    expect(await s.currentSession()).toBeNull();
    expect(await s.currentOrgId()).toBeNull();
  });

  it('reports the free plan so the paywall is exercised, not bypassed', async () => {
    const s = await load();
    expect(await s.currentPlan()).toBe('free');
  });
});

describe('signed in', () => {
  it('returns the org and plan from the profile', async () => {
    mockSupabase({
      user: { id: 'user-1' },
      profile: { org_id: 'org-1', organizations: { plan: 'pro' } },
    });
    const s = await load();
    expect(await s.currentSession()).toEqual({ userId: 'user-1', orgId: 'org-1', plan: 'pro' });
    expect(await s.currentOrgId()).toBe('org-1');
    expect(await s.currentPlan()).toBe('pro');
  });

  it('falls back to free when the plan is not a known tier', async () => {
    // A typo or a future tier must not silently grant entitlements.
    mockSupabase({
      user: { id: 'user-1' },
      profile: { org_id: 'org-1', organizations: { plan: 'enterprise' } },
    });
    const s = await load();
    expect(await s.currentPlan()).toBe('free');
  });

  it('falls back to free when the embedded organization is missing', async () => {
    mockSupabase({ user: { id: 'user-1' }, profile: { org_id: 'org-1', organizations: null } });
    const s = await load();
    expect(await s.currentPlan()).toBe('free');
    expect(await s.currentOrgId()).toBe('org-1');
  });
});

describe('fails closed rather than open', () => {
  it('treats an unreadable profile as signed out', async () => {
    // Authenticated with no profile row should be impossible — handle_new_user()
    // creates one. If it happens anyway, asking them to sign in again beats
    // serving an ownerless page.
    mockSupabase({ user: { id: 'user-1' }, profileError: true });
    const s = await load();
    expect(await s.currentSession()).toBeNull();
    expect(await s.currentOrgId()).toBeNull();
  });

  it('ignores a row that arrives alongside an error', async () => {
    // PostgREST normally nulls `data` when it sets `error`, so the `error ||`
    // guard is belt-and-braces over the org_id check. This is the case that
    // actually exercises it: a row present AND an error set. Without a separate
    // case here the guard would be untested and could be deleted unnoticed.
    mockSupabase({
      user: { id: 'user-1' },
      profile: { org_id: 'org-1', organizations: { plan: 'pro' } },
      profileErrorWithRow: true,
    });
    const s = await load();
    expect(await s.currentSession()).toBeNull();
  });

  it('treats a profile with no org_id as signed out', async () => {
    mockSupabase({ user: { id: 'user-1' }, profile: { org_id: null, organizations: null } });
    const s = await load();
    expect(await s.currentOrgId()).toBeNull();
  });
});
