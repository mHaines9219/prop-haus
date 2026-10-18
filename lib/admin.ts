import { PLAN_TIERS, type PlanTier } from './accounts';

/**
 * Who may masquerade. Admins can view the site as any plan tier (the nav's
 * VIEW AS control) without their org's plan changing.
 *
 * The allowlist is `ADMIN_EMAILS`, comma-separated. It defaults to the
 * founder's address so the control works with zero configuration; set the
 * variable to add or replace admins. Matching is on the Supabase auth email,
 * case-insensitive, so there is no admin flag to grant in the database and
 * nothing a client could write to promote itself.
 */
const DEFAULT_ADMIN_EMAILS = ['mhaines9219@gmail.com'];

type Env = Record<string, string | undefined>;

export function adminEmails(env: Env = process.env): string[] {
  const raw = env.ADMIN_EMAILS?.trim();
  const list = raw ? raw.split(',') : DEFAULT_ADMIN_EMAILS;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, env?: Env): boolean {
  if (!email) return false;
  return adminEmails(env).includes(email.trim().toLowerCase());
}

/**
 * The masquerade cookie: a plan tier the admin is viewing as. httpOnly, so
 * only the view-as route writes it; lib/session.ts honours it only when the
 * signed-in email is an admin, so a stray cookie on anyone else is inert.
 */
export const VIEW_AS_COOKIE = 'ph-view-as';

export function parseViewAs(value: string | undefined | null): PlanTier | null {
  return value && (PLAN_TIERS as readonly string[]).includes(value) ? (value as PlanTier) : null;
}
