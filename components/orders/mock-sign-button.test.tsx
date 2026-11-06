import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { MockSignButton } from './mock-sign-button';

const fetchMock = vi.fn();

beforeEach(() => {
  resetNavigation();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

function button() {
  return screen.getByRole('button', { name: 'Sign as the ordering contact' });
}

describe('MockSignButton', () => {
  it('posts to the document mock-sign route and returns to the refreshed order', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    render(<MockSignButton orderId="o1" documentId="d1" />);
    fireEvent.click(button());

    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/o1'));
    expect(fetchMock).toHaveBeenCalledWith('/api/forms/d1/mock-sign', { method: 'POST' });
    expect(nav.router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole('paragraph')).toBeNull();
  });

  it('shows Signing and disables the button while the request is in flight', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<MockSignButton orderId="o1" documentId="d1" />);
    fireEvent.click(button());

    const busy = await screen.findByRole('button', { name: 'Signing' });
    expect(busy).toBeDisabled();
    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(button()).toBeEnabled());
  });

  it('shows the server error and stays on the page when the route refuses', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Already signed.' }), { status: 409 }));
    render(<MockSignButton orderId="o1" documentId="d1" />);
    fireEvent.click(button());

    expect(await screen.findByText('Already signed.')).toBeInTheDocument();
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('falls back to a generic error when the failure body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    render(<MockSignButton orderId="o1" documentId="d1" />);
    fireEvent.click(button());

    expect(await screen.findByText('The signature did not go through. Try again.')).toBeInTheDocument();
  });

  it('shows the generic error on a network failure and clears it on the next attempt', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    render(<MockSignButton orderId="o1" documentId="d1" />);
    fireEvent.click(button());
    expect(await screen.findByText('The signature did not go through. Try again.')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    fireEvent.click(button());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/orders/o1'));
    expect(screen.queryByText('The signature did not go through. Try again.')).toBeNull();
  });
});
