import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components (browser). Uses the publishable/anon
 * key, which is safe to ship to the browser, and runs under RLS as the
 * signed-in user. NEVER import the service-role key into client code.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
