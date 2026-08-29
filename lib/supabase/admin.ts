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
  // New-style secret key (sb_secret_...), with the legacy service-role name
  // accepted so deployed environments using it keep working. Neither may ever
  // carry a NEXT_PUBLIC_ prefix.
  const key = process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
