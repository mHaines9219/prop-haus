import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { PLAN_TIERS, type PlanTier } from './accounts';

/**
 * Who is asking, and what are they entitled to.
 *
 * Every server-side answer to those two questions routes through here. That is
 * why replacing the placeholder was a change to this file and nothing else — no
 * call site moved, which was the point of building the seam first.
 *
 * There is no bootstrap step to run. `handle_new_user()` creates the
 * organization, owner membership and profile stub on insert into `auth.users`
 * (20260627181123_init_accounts.sql:154), so a session always has an org by the
 * time we can read it, and there is no null-org window. Signing in for the first
 * time is signing up.
 */

export type Session = {
  userId: string;
  orgId: string;
  plan: PlanTier;
};

function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === 'string' && (PLAN_TIERS as readonly string[]).includes(v);
}

/**
 * The signed-in caller, or null when there is no session.
 *
 * Wrapped in React `cache()` so a page rendering both a jobs list and an
 * allowance line issues one query rather than two. The dedupe is per-request, so
 * it cannot serve one visitor's org to another.
 *
 * `getUser()` rather than `getSession()`: the latter trusts the cookie as-is,
 * the former revalidates against the auth server. `middleware.ts` keeps it fresh.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // One round trip for both facts. Existing RLS already permits both: "read
  // profiles in my orgs" covers `id = auth.uid()`, and "org members read their
  // orgs" covers the embedded organization.
  const { data, error } = await supabase
    .from('profiles')
    .select('org_id, organizations(plan)')
    .eq('id', user.id)
    .single();

  // An authenticated user with no profile row should be impossible, since the
  // trigger creates one. Treating it as signed-out is the safe direction —
  // failing open would render an owned page with no owner.
  if (error || !data?.org_id) return null;

  // PostgREST returns an embedded to-one as an object, but without generated
  // types it arrives loosely typed. Narrow rather than assert, and fall back to
  // the least-privileged tier rather than trusting an unexpected shape.
  const org: unknown = data.organizations;
  const plan =
    org && typeof org === 'object' && 'plan' in org && isPlanTier((org as { plan: unknown }).plan)
      ? ((org as { plan: PlanTier }).plan satisfies PlanTier)
      : 'free';

  return { userId: user.id, orgId: data.org_id as string, plan };
});

/** The owning organization, or null when signed out. */
export async function currentOrgId(): Promise<string | null> {
  return (await currentSession())?.orgId ?? null;
}

/**
 * Entitlements for the current caller.
 *
 * Defaults to 'free' when signed out so the paywall is EXERCISED rather than
 * bypassed. An unwired gate that always says yes is the same bug as no gate.
 */
export async function currentPlan(): Promise<PlanTier> {
  return (await currentSession())?.plan ?? 'free';
}

/**
 * For Server Components that cannot render without an owner. Redirects to
 * sign-in, carrying where the visitor was headed so they land there rather than
 * on the default.
 *
 * Server Components only — `redirect()` throws a control-flow signal that a
 * route handler would surface as a 500. Route handlers check for null and answer
 * 401 themselves.
 */
export async function requireOrgId(next?: string): Promise<string> {
  const orgId = await currentOrgId();
  if (orgId) return orgId;
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
}
