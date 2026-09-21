import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { JobStatusSelect } from './job-status-select';

/**
 * The user's own status control: a token-shaped native select that writes
 * through PATCH /api/orders/[id]/status, flips at once, refreshes on success
 * and rolls back with a plain error line when the write fails.
 */

const fetchMock = vi.fn<typeof fetch>();

function ok() {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
}

beforeEach(() => {
  resetNavigation();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JobStatusSelect', () => {
  it('renders the three statuses in a token-shaped select with the tone dot', () => {
    const { container } = render(<JobStatusSelect orderId="o-1" value="active" label="Status for order #O-1" />);
    const select = screen.getByRole('combobox', { name: 'Status for order #O-1' });
    expect(select).toHaveValue('active');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['ACTIVE', 'PENDING', 'DONE']);
    expect(select).toHaveClass('font-mono', 'uppercase');
    expect(container.querySelector('.bg-status-quoted')).not.toBeNull();
  });

  it('PATCHes the new status, reports it, swaps the dot and refreshes the route', async () => {
    ok();
    const onChange = vi.fn();
    const { container } = render(
      <JobStatusSelect orderId="o-1" value="active" label="Status" onChange={onChange} />,
    );

    await userEvent.selectOptions(screen.getByRole('combobox'), 'done');

    expect(onChange).toHaveBeenCalledWith('done');
    expect(screen.getByRole('combobox')).toHaveValue('done');
    expect(container.querySelector('.bg-status-confirmed')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/orders/o-1/status');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ jobStatus: 'done' });
    await vi.waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rolls back and shows an error line when the write fails', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'update failed' }), { status: 500 }));
    const onChange = vi.fn();
    render(<JobStatusSelect orderId="o-1" value="active" label="Status" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'pending');

    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The status did not save. Try again.'));
    expect(screen.getByRole('combobox')).toHaveValue('active');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['pending', 'active']);
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });

  it('follows a new server value after a refresh', () => {
    const { rerender } = render(<JobStatusSelect orderId="o-1" value="active" label="Status" />);
    rerender(<JobStatusSelect orderId="o-1" value="done" label="Status" />);
    expect(screen.getByRole('combobox')).toHaveValue('done');
  });
});
