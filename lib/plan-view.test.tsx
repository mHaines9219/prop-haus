import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiAllowance } from '@/test/helpers/plan';
import { FREE_VIEW, PlanProvider, useAiSearchStanding, useEntitled, usePlanView } from './plan-view';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected fetch ${String(input)}`);
    return Promise.resolve(route());
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function Probe() {
  const view = usePlanView();
  const vendor = useEntitled('vendorIdentity');
  const { exhausted, allowance } = useAiSearchStanding();
  return (
    <dl>
      <dd data-testid="status">{view.status}</dd>
      <dd data-testid="plan">{view.plan}</dd>
      <dd data-testid="signed-in">{String(view.signedIn)}</dd>
      <dd data-testid="vendor">{String(vendor)}</dd>
      <dd data-testid="exhausted">{String(exhausted)}</dd>
      <dd data-testid="remaining">{String(allowance?.remaining ?? 'none')}</dd>
    </dl>
  );
}

function renderProvider(children: ReactNode = <Probe />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlanProvider>{children}</PlanProvider>
    </QueryClientProvider>,
  );
}

const me = (over: Record<string, unknown> = {}) => ({
  signedIn: true,
  plan: 'pro',
  actualPlan: 'pro',
  isAdmin: false,
  sandbox: false,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('PlanProvider', () => {
  it('is loading, with no entitlement answer, until /api/me responds', async () => {
    let answer!: (r: Response) => void;
    stubFetch({ '/api/me': () => new Promise<Response>((resolve) => (answer = resolve)) });
    renderProvider();
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('vendor')).toHaveTextContent('null');

    answer(json(me({ signedIn: false, plan: 'free', actualPlan: 'free' })));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('vendor')).toHaveTextContent('false');
  });

  it('a signed-in caller gets their plan and their AI search standing', async () => {
    const fetchMock = stubFetch({
      '/api/me': () => json(me({ plan: 'directory', actualPlan: 'directory' })),
      '/api/usage': () => json({ plan: 'directory', metrics: { aiSearches: aiAllowance({ used: 3, remaining: 0, allowed: false }) } }),
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('remaining')).toHaveTextContent('0'));
    expect(screen.getByTestId('plan')).toHaveTextContent('directory');
    expect(screen.getByTestId('vendor')).toHaveTextContent('true');
    expect(screen.getByTestId('exhausted')).toHaveTextContent('true');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/me', '/api/usage']);
  });

  it('never asks for usage when signed out', async () => {
    const fetchMock = stubFetch({ '/api/me': () => json(me({ signedIn: false, plan: 'free', actualPlan: 'free' })) });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('signed-in')).toHaveTextContent('false');
    expect(screen.getByTestId('remaining')).toHaveTextContent('none');
    expect(screen.getByTestId('exhausted')).toHaveTextContent('false');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the free view when /api/me fails, withholding rather than revealing', async () => {
    stubFetch({ '/api/me': () => json({ error: 'down' }, 500) });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('plan')).toHaveTextContent('free');
    expect(screen.getByTestId('vendor')).toHaveTextContent('false');
  });
});

describe('without a provider', () => {
  it('reads the free view', () => {
    render(<Probe />);
    expect(screen.getByTestId('status')).toHaveTextContent(FREE_VIEW.status);
    expect(screen.getByTestId('plan')).toHaveTextContent('free');
    expect(screen.getByTestId('vendor')).toHaveTextContent('false');
    expect(screen.getByTestId('exhausted')).toHaveTextContent('false');
  });
});
