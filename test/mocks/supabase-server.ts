import { FakeSupabase } from '@/test/helpers/fake-supabase';

/**
 * Stand-in for @/lib/supabase/server (the cookie-bound, RLS-scoped client).
 *
 *   vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());
 *   import { auth, userDb } from '@/test/mocks/supabase-server';
 *
 * `auth.user` is what getUser() returns; `auth.exchangeResult` drives
 * exchangeCodeForSession. `userDb` is the query surface, separate from the
 * admin fake so a test can tell which client a handler used.
 */
export const userDb = new FakeSupabase();

export const auth = {
  user: null as { id: string; email?: string } | null,
  exchangeResult: { error: null as { message: string } | null },
  signOutCalls: 0,
  exchangeCalls: [] as string[],
  reset() {
    this.user = null;
    this.exchangeResult = { error: null };
    this.signOutCalls = 0;
    this.exchangeCalls = [];
  },
};

export function serverModule() {
  return {
    createClient: async () => ({
      ...userDb.client(),
      auth: {
        getUser: async () => ({ data: { user: auth.user }, error: null }),
        signOut: async () => {
          auth.signOutCalls += 1;
          auth.user = null;
          return { error: null };
        },
        exchangeCodeForSession: async (code: string) => {
          auth.exchangeCalls.push(code);
          return { data: {}, error: auth.exchangeResult.error };
        },
      },
    }),
  };
}
