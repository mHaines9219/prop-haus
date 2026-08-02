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

/**
 * Stand-in owner for every project until sessions exist.
 *
 * A fixed uuid rather than a random one so projects created across restarts stay
 * visible to each other in the jobs list. It does NOT correspond to a real row in
 * `public.organizations` — the file-backed store has no foreign keys, and by the
 * time the Postgres port lands this function will be reading a real session.
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
