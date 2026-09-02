import type { Session } from '@/lib/session';

/**
 * Stand-in for @/lib/session. In a test file:
 *
 *   vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
 *   import { signIn, signOut } from '@/test/mocks/session';
 *
 * The factory and the test share one module instance, so `signIn()` before a
 * request is what the handler sees. Do not combine with vi.resetModules().
 */
export const sessionState: { current: Session | null } = { current: null };

export const ORG_ID = '00000000-0000-4000-8000-00000000a001';
export const USER_ID = '00000000-0000-4000-8000-00000000b001';
export const OTHER_ORG_ID = '00000000-0000-4000-8000-00000000a002';

export function signIn(over: Partial<Session> = {}): Session {
  sessionState.current = { userId: USER_ID, orgId: ORG_ID, plan: 'free', ...over };
  return sessionState.current;
}

export function signOut() {
  sessionState.current = null;
}

export class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export function sessionModule() {
  return {
    currentSession: async () => sessionState.current,
    currentOrgId: async () => sessionState.current?.orgId ?? null,
    currentPlan: async () => sessionState.current?.plan ?? 'free',
    requireOrgId: async (next?: string) => {
      if (sessionState.current) return sessionState.current.orgId;
      throw new RedirectSignal(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    },
  };
}
