/**
 * `after()` from next/server needs a request scope that only exists inside the
 * Next runtime. Route tests replace it with a synchronous runner:
 *
 *   vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
 *   import { afterCalls } from '@/test/mocks/next-server';
 *
 * Everything else (NextResponse, NextRequest) is the real module.
 */
export const afterCalls: Array<() => unknown> = [];

export function resetAfter() {
  afterCalls.length = 0;
}

/** Run the hooks a handler scheduled, in order, awaiting each. */
export async function flushAfter() {
  for (const fn of afterCalls.splice(0)) await fn();
}

export async function nextServerModule() {
  const actual = await import('next/server');
  return {
    ...actual,
    after: (fn: () => unknown) => {
      afterCalls.push(fn);
    },
  };
}
