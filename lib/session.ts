/**
 * The seam auth plugs into.
 *
 * Every server-side "who is asking?" question routes through here, so wiring real
 * sessions is a change to this file rather than a hunt through route handlers.
 *
 * TEMPORARY: no auth is wired yet, so this returns a single placeholder org. That
 * is deliberate and load-bearing — it means ownership is threaded end to end NOW,
 * while there are zero rows, instead of being retrofitted onto live projects later.
 * `projects.org_id` is `not null` in the schema (supabase/migrations/
 * 20260802003000_workflow_projects.sql), so there is no nullable-owner state to
 * clean up when this is replaced.
 *
 * Replacing it: read the Supabase session (lib/supabase/server.ts), look up the
 * caller's membership, return their org id, and throw/redirect when absent. The
 * call sites do not change.
 */
import type { PlanTier } from './accounts';

/**
 * Stand-in owner for every request until sessions exist.
 *
 * A fixed uuid rather than a random one so work created across restarts stays
 * visible to itself in the jobs list.
 *
 * IT MUST CORRESPOND TO A REAL ROW in `public.organizations`, seeded by
 * `supabase/migrations/20260802013000_seed_placeholder_org.sql`. Six tables carry
 * `org_id ... references organizations(id)`, and `public.events` is written on
 * every search through `lib/analytics.ts` — which catches its own errors so
 * analytics can never 502 a search. A dangling id there fails the foreign key,
 * gets swallowed, and leaves the events table empty while everything looks fine.
 *
 * If you change this value, change the migration in the same commit.
 */
export const PLACEHOLDER_ORG_ID = '00000000-0000-0000-0000-0000000000aa';

/** True while auth is unwired — for surfacing "you are not really signed in" in dev UI. */
export const IS_PLACEHOLDER_SESSION = true;

/**
 * The organization the current request acts on behalf of.
 *
 * Async from the start: reading a session means reading cookies, which is async in
 * the App Router. Callers already await it, so switching to real auth does not
 * ripple.
 */
export async function currentOrgId(): Promise<string> {
  return PLACEHOLDER_ORG_ID;
}

/**
 * The plan the current request is entitled to.
 *
 * Defaults to 'free' so the paywall is EXERCISED in development rather than
 * silently bypassed — an unwired gate that always says yes is the same bug as no
 * gate at all. Replacing this reads `organizations.plan` for the session's org;
 * the column already exists and defaults to 'free' too.
 */
export async function currentPlan(): Promise<PlanTier> {
  return 'free';
}
