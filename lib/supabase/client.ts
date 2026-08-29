import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components (browser). Uses the publishable/anon
 * key, which is safe to ship to the browser, and runs under RLS as the
 * signed-in user. NEVER import the service-role key into client code.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // New-style publishable key (sb_publishable_...), with the legacy anon key
    // name accepted so deployed environments using it keep working.
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
