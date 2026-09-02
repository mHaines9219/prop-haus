import { vi } from 'vitest';

/**
 * Controllable stand-in for next/navigation, registered for every ui test in
 * test/setup-ui.ts. Set `nav.pathname` / `nav.searchParams` before rendering,
 * and assert on `nav.router.push` etc. afterwards. Call `resetNavigation()` in a
 * beforeEach when a file changes them.
 */
export const nav = {
  pathname: '/',
  searchParams: new URLSearchParams(),
  params: {} as Record<string, string>,
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
};

export function resetNavigation() {
  nav.pathname = '/';
  nav.searchParams = new URLSearchParams();
  nav.params = {};
  for (const fn of Object.values(nav.router)) fn.mockReset();
}

export class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export function navigationModule() {
  return {
    useRouter: () => nav.router,
    usePathname: () => nav.pathname,
    useSearchParams: () => nav.searchParams,
    useParams: () => nav.params,
    useSelectedLayoutSegment: () => null,
    useSelectedLayoutSegments: () => [],
    redirect: (url: string) => {
      throw new RedirectSignal(url);
    },
    permanentRedirect: (url: string) => {
      throw new RedirectSignal(url);
    },
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND');
    },
  };
}
