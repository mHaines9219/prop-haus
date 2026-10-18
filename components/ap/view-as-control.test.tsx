import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planView, withPlan } from '@/test/helpers/plan';
import { ViewAsControl } from './view-as-control';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// The admin's masquerade tab: hidden for members, lists the three tiers plus
// "my plan", writes the choice and refreshes everything that reads the plan.

const fetchMock = vi.fn();

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { invalidate };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  refresh.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('ViewAsControl', () => {
  it('renders nothing for a member, or while the plan is loading', () => {
    mount(withPlan(<ViewAsControl />, 'pro'));
    expect(screen.queryByRole('combobox')).toBeNull();
    mount(withPlan(<ViewAsControl />, planView('pro', { isAdmin: true, status: 'loading' })));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('offers the admin their own plan and the three tiers, naming the current view', () => {
    mount(withPlan(<ViewAsControl />, planView('pro', { isAdmin: true })));
    const select = screen.getByRole('combobox', { name: 'View the site as a plan tier' });
    expect(select).toHaveValue('own');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'My plan · Coordinator',
      'Browse',
      'Directory',
      'Coordinator',
    ]);
  });

  it('shows the masqueraded tier as selected', () => {
    mount(withPlan(<ViewAsControl />, planView('pro', { isAdmin: true, plan: 'free' })));
    expect(screen.getByRole('combobox')).toHaveValue('free');
  });

  it('posts the pick, then invalidates me and usage and refreshes the page', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ viewingAs: 'directory' }), { status: 200 }));
    const { invalidate } = mount(withPlan(<ViewAsControl />, planView('pro', { isAdmin: true })));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'directory' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/view-as');
    expect(JSON.parse(init.body as string)).toEqual({ plan: 'directory' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['usage'] });
  });

  it('posts plan: null to return to the admin’s own plan', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ viewingAs: null }), { status: 200 }));
    mount(withPlan(<ViewAsControl />, planView('pro', { isAdmin: true, plan: 'free' })));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'own' } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ plan: null });
  });
});
