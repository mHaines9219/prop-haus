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

const ADMIN = 'mhaines9219@gmail.com';

/** The request's cookie jar; only the view-as cookie matters here. */
const jar: { viewAs?: string } = {};

function mockSupabase(opts: {
  user: { id: string; email?: string } | null;
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
  delete jar.viewAs;
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => (name === 'ph-view-as' && jar.viewAs ? { value: jar.viewAs } : undefined),
    }),
  }));
});

afterEach(() => {
  vi.doUnmock('./supabase/server');
  vi.doUnmock('next/headers');
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
    expect(await s.currentSession()).toEqual({
      userId: 'user-1',
      orgId: 'org-1',
      plan: 'pro',
      actualPlan: 'pro',
      email: null,
      isAdmin: false,
    });
    expect(await s.currentOrgId()).toBe('org-1');
    expect(await s.currentPlan()).toBe('pro');
  });

  it('accepts the directory tier', async () => {
    mockSupabase({
      user: { id: 'user-1' },
      profile: { org_id: 'org-1', organizations: { plan: 'directory' } },
    });
    const s = await load();
    expect(await s.currentPlan()).toBe('directory');
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

describe('masquerade', () => {
  it('an admin viewing as another tier gets that tier, with the real one kept alongside', async () => {
    jar.viewAs = 'free';
    mockSupabase({
      user: { id: 'user-1', email: ADMIN },
      profile: { org_id: 'org-1', organizations: { plan: 'pro' } },
    });
    const s = await load();
    expect(await s.currentSession()).toMatchObject({
      plan: 'free',
      actualPlan: 'pro',
      email: ADMIN,
      isAdmin: true,
    });
    expect(await s.currentPlan()).toBe('free');
  });

  it('an admin with no cookie sees their own plan', async () => {
    mockSupabase({
      user: { id: 'user-1', email: ADMIN },
      profile: { org_id: 'org-1', organizations: { plan: 'free' } },
    });
    const s = await load();
    expect(await s.currentSession()).toMatchObject({ plan: 'free', actualPlan: 'free', isAdmin: true });
  });

  it('the cookie is inert for everyone else', async () => {
    // A member who somehow carries the cookie must not promote themselves.
    jar.viewAs = 'pro';
    mockSupabase({
      user: { id: 'user-1', email: 'member@example.com' },
      profile: { org_id: 'org-1', organizations: { plan: 'free' } },
    });
    const s = await load();
    expect(await s.currentSession()).toMatchObject({ plan: 'free', actualPlan: 'free', isAdmin: false });
  });

  it('an unknown cookie value is ignored even for an admin', async () => {
    jar.viewAs = 'enterprise';
    mockSupabase({
      user: { id: 'user-1', email: ADMIN },
      profile: { org_id: 'org-1', organizations: { plan: 'pro' } },
    });
    const s = await load();
    expect(await s.currentPlan()).toBe('pro');
  });
});
