import { createAdminClient } from './supabase/admin';

/**
 * Create and REMOVE a throwaway auth user, correctly.
 *
 * Not application code — this exists for integration tests and one-off probes
 * against the shared live project, and it encodes an ordering that three of us
 * got wrong in one afternoon.
 *
 * WHY IT IS NOT TWO DELETES
 *
 * `handle_new_user()` creates an organization, a membership and a profile for
 * every new `auth.users` row. Deleting the user cascades the profile and the
 * membership, but nothing points from an organization back to `auth.users`, so
 * the org is left behind — named after the user's email address.
 *
 * The obvious follow-up, deleting the org, fails if you do it immediately:
 * `profiles.org_id` is the one org foreign key with NO `on delete` clause
 * (20260627181123_init_accounts.sql:47), so it is NO ACTION. While the profile
 * row still exists the delete is REFUSED with 409 / SQLSTATE 23503.
 *
 * And a `finally` block that fires both deletes without reading the responses
 * reports success and leaves the org behind. That is exactly how it happened:
 * the failure is silent at the only moment nobody is looking.
 *
 * So: delete the user, WAIT for the profile cascade to actually land, then
 * delete the org, then read back and throw if anything survived.
 */

export type ProbeUser = {
  userId: string;
  orgId: string;
  email: string;
};

/** Distinctive enough that a leaked row is obviously a probe and not real data. */
function probeEmail(label: string): string {
  const safe = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `probe-${safe}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
}

/**
 * Creates a confirmed auth user and returns it along with the organization the
 * trigger made for it. Throws rather than returning a partial result — a probe
 * that half-exists is worse than one that failed.
 */
export async function createProbeUser(label = 'probe'): Promise<ProbeUser> {
  const db = createAdminClient();
  const email = probeEmail(label);

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `${crypto.randomUUID()}Aa1!`,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createProbeUser: ${error?.message ?? 'no user returned'}`);
  }
  const userId = data.user.id;

  // The trigger runs inside the insert, so the profile is there by now. Read the
  // org from it rather than guessing — this is also what proves the trigger fired.
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single();

  if (profileError || !profile?.org_id) {
    // Do not leave the user behind just because we could not read its profile.
    await db.auth.admin.deleteUser(userId);
    throw new Error(
      `createProbeUser: handle_new_user() produced no profile for ${userId}: ${profileError?.message ?? 'no org_id'}`,
    );
  }

  return { userId, orgId: profile.org_id as string, email };
}

/**
 * Removes the user AND the organization the trigger created, in the only order
 * that works, and verifies the result rather than assuming it.
 *
 * Throws if anything survives. A cleanup helper that swallows its own failure is
 * the bug it exists to prevent.
 */
export async function deleteProbeUser(probe: ProbeUser): Promise<void> {
  const db = createAdminClient();

  const { error: userError } = await db.auth.admin.deleteUser(probe.userId);
  if (userError) throw new Error(`deleteProbeUser: user: ${userError.message}`);

  // Wait for the profile cascade before touching the org.
  //
  // HONEST STATUS: this is insurance, not a demonstrated necessity. I observed
  // the org survive a delete issued immediately after the user delete once, in a
  // real probe — but I could not reproduce it afterwards: removing this wait and
  // re-running the suite still passes, so on this database the cascade appears
  // to land synchronously. Keeping it because it is two lines and the failure it
  // guards is silent, but do not read it as proven.
  //
  // The part that IS load-bearing is the read-back below. Both of the real
  // incidents were cleanups that issued deletes and never looked at the result.
  const gone = await waitFor(async () => {
    const { count } = await db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('id', probe.userId);
    return (count ?? 0) === 0;
  });
  if (!gone) {
    throw new Error(
      `deleteProbeUser: profile for ${probe.userId} still present after the user was deleted; ` +
        `the org delete would be refused by profiles_org_id_fkey`,
    );
  }

  const { error: orgError } = await db.from('organizations').delete().eq('id', probe.orgId);
  if (orgError) throw new Error(`deleteProbeUser: org: ${orgError.message}`);

  // Read it back. This is the step whose absence caused the problem twice.
  const { count: orgsLeft, error: checkError } = await db
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('id', probe.orgId);
  if (checkError) throw new Error(`deleteProbeUser: verify: ${checkError.message}`);
  if ((orgsLeft ?? 0) !== 0) {
    throw new Error(`deleteProbeUser: organization ${probe.orgId} (${probe.email}) survived cleanup`);
  }
}

/** Run `fn`, guaranteeing cleanup even if it throws, and surfacing both failures. */
export async function withProbeUser<T>(
  label: string,
  fn: (probe: ProbeUser) => Promise<T>,
): Promise<T> {
  const probe = await createProbeUser(label);
  try {
    return await fn(probe);
  } finally {
    // Deliberately NOT swallowed: if cleanup fails against a shared database,
    // that is the thing most worth knowing, and a silent catch here would
    // reproduce the exact failure this module exists to prevent.
    await deleteProbeUser(probe);
  }
}

async function waitFor(
  predicate: () => Promise<boolean>,
  { attempts = 10, delayMs = 100 } = {},
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}
