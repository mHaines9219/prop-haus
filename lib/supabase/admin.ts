import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only.
 *
 * Use ONLY for trusted, privileged writes that RLS deliberately forbids from
 * clients: incrementing usage_counters, inserting events, setting a verified
 * document/vendor status, and changing organizations.plan from the billing
 * webhook. Never import this into a Client Component, and never expose the
 * service-role key to the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
