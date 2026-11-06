import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planView, withPlan } from '@/test/helpers/plan';
import { SandboxToggle } from './sandbox-toggle';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// The corner switch: hidden for members, shows its state, and flips it.

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

describe('SandboxToggle', () => {
  it('renders nothing for a member, or while the plan is loading', () => {
    mount(withPlan(<SandboxToggle />, 'pro'));
    mount(withPlan(<SandboxToggle />, planView('pro', { isAdmin: true, status: 'loading' })));
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows an admin whether the sandbox is on', () => {
    mount(withPlan(<SandboxToggle />, planView('pro', { isAdmin: true })));
    expect(screen.getByRole('switch', { name: 'Sandbox mode' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('flips the switch, then refreshes what reads it', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sandbox: true }), { status: 200 }));
    const { invalidate } = mount(withPlan(<SandboxToggle />, planView('pro', { isAdmin: true })));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/sandbox');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ on: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
  });

  it('turns off from on, and says so when the flip fails', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    mount(withPlan(<SandboxToggle />, planView('pro', { isAdmin: true, sandbox: true })));
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('title', 'The switch did not flip. Try again.'));
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({ on: false });
    expect(refresh).not.toHaveBeenCalled();
  });
});
