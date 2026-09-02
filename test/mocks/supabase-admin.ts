import { FakeSupabase } from '@/test/helpers/fake-supabase';

/**
 * Stand-in for @/lib/supabase/admin backed by one in-memory FakeSupabase.
 *
 *   vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
 *   import { db } from '@/test/mocks/supabase-admin';
 *   beforeEach(() => db.reset());
 *
 * Seed rows with db.seed(table, rows), register RPCs with db.rpc(name, fn),
 * inject failures with db.failNext(table, op, error).
 */
export const db = new FakeSupabase();

export function adminModule() {
  return { createAdminClient: () => db.client() };
}
