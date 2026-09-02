import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpacelabPanel, type PreparedSceneView } from './spacelab-panel';

// The order-page 3D handoff: build the room via POST /api/spacelab/scenes,
// then show open / room-file / rebuild depending on what came back.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const scene = (over: Partial<PreparedSceneView> = {}): PreparedSceneView => ({
  id: 'scene-1',
  itemCount: 3,
  modelReadyCount: 3,
  roomUrl: 'https://spacelab.test/room/1',
  roomFileUrl: '/api/spacelab/scenes/scene-1/room.json',
  catalogUrl: '/api/spacelab/catalog',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;

describe('SpacelabPanel', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => json(scene()));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers to build the set when nothing is prepared', () => {
    render(<SpacelabPanel orderId="o1" initialScene={null} />);
    expect(screen.getByRole('heading', { name: 'Set preview' })).toBeInTheDocument();
    expect(screen.getByText(/Arrange this order in a 3D room/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build your set in 3D' })).toBeEnabled();
    expect(screen.queryByText(/items modeled/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('posts the order id, shows the busy label, then the prepared scene', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    render(<SpacelabPanel orderId="o1" initialScene={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Build your set in 3D' }));

    expect(screen.getByRole('button', { name: 'Building…' })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/spacelab/scenes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ orderId: 'o1' });

    resolve(json(scene()));
    expect(await screen.findByText('3 of 3 items modeled')).toBeInTheDocument();
    expect(screen.getByText(/Your order is staged in a room/)).toBeInTheDocument();
    const open = screen.getByRole('link', { name: 'Open in Spacelab' });
    expect(open).toHaveAttribute('href', 'https://spacelab.test/room/1');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Room file' })).toHaveAttribute('href', '/api/spacelab/scenes/scene-1/room.json');
    expect(screen.getByRole('button', { name: 'Rebuild' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Build your set in 3D' })).toBeNull();
  });

  it('explains the import step when Spacelab has no deployment', () => {
    render(<SpacelabPanel orderId="o1" initialScene={scene({ roomUrl: null })} />);
    expect(screen.queryByRole('link', { name: 'Open in Spacelab' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Room file' })).toBeInTheDocument();
    expect(screen.getByText(/Spacelab has no deployment yet/)).toBeInTheDocument();
  });

  it('counts items still without a model, singular and plural', () => {
    const { unmount } = render(<SpacelabPanel orderId="o1" initialScene={scene({ modelReadyCount: 2 })} />);
    expect(screen.getByText('2 of 3 items modeled')).toBeInTheDocument();
    expect(screen.getByText(/^1 item still without a model/)).toBeInTheDocument();

    unmount();
    render(<SpacelabPanel orderId="o1" initialScene={scene({ modelReadyCount: 1 })} />);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /^2 items still without a model/.test(el.textContent ?? ''))).toBeInTheDocument();
  });

  it('handles an order with no items', () => {
    render(<SpacelabPanel orderId="o1" initialScene={scene({ itemCount: 0, modelReadyCount: 0 })} />);
    expect(screen.getByText('No items on this order.')).toBeInTheDocument();
    expect(screen.queryByText(/without a model/)).toBeNull();
  });

  it('rebuilds an existing scene and swaps in the new one', async () => {
    fetchMock.mockResolvedValueOnce(json(scene({ modelReadyCount: 3, id: 'scene-2', roomFileUrl: '/room2.json' })));
    render(<SpacelabPanel orderId="o1" initialScene={scene({ modelReadyCount: 1 })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rebuild' }));
    expect(await screen.findByText('3 of 3 items modeled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Room file' })).toHaveAttribute('href', '/room2.json');
  });

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Order has no items with photos' }, 422));
    render(<SpacelabPanel orderId="o1" initialScene={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Build your set in 3D' }));
    expect(await screen.findByText('Order has no items with photos')).toHaveClass('text-status-unavailable');
    expect(screen.getByRole('button', { name: 'Build your set in 3D' })).toBeEnabled();
  });

  it('falls back to a generic message on a non-JSON failure or a network error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    render(<SpacelabPanel orderId="o1" initialScene={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Build your set in 3D' }));
    expect(await screen.findByText('Could not build the room.')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Build your set in 3D' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Could not build the room.')).toBeNull());
  });
});
