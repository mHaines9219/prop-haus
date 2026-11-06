import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpacelabStudio } from './studio';

// three.js needs WebGL; the render view is a stub here and the scene reaches
// the test through the floor plan and the items rail instead.
vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="render-view" />,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

describe('SpacelabStudio', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      json({ reply: 'Placed the rattan armchair against the back wall.', commands: [{ type: 'place', itemId: 'armchair', x: 9, z: 1.4 }], provider: 'mock' }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lays out the four panels under the Space Lab header', () => {
    render(<SpacelabStudio />);
    expect(screen.getByRole('heading', { name: 'Space Lab' })).toBeInTheDocument();
    for (const name of ['Items', 'Render', 'Floor plan', 'Chat']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('3/6 placed')).toBeInTheDocument();
    expect(screen.getByTestId('render-view')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Floor plan: 18 by 12 feet' })).toBeInTheDocument();
  });

  it('sends the scene to the chat route and applies the commands that come back', async () => {
    render(<SpacelabStudio />);
    const input = screen.getByLabelText('Tell the model what to change');
    await userEvent.type(input, 'armchair against the back wall');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText(/Placed the rattan armchair/)).toBeInTheDocument());
    expect(screen.getByText('armchair against the back wall')).toBeInTheDocument();
    expect(screen.getByText('4/6 placed')).toBeInTheDocument();
    expect(input).toHaveValue('');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/spacelab/chat');
    const body = JSON.parse(init.body as string);
    expect(body.message).toBe('armchair against the back wall');
    expect(body.scene.room).toEqual({ width: 18, depth: 12, height: 9 });
    expect(body.history).toHaveLength(1);
  });

  it('explains a sign-in refusal instead of failing silently', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'not signed in' }, 401));
    render(<SpacelabStudio />);
    await userEvent.type(screen.getByLabelText('Tell the model what to change'), 'hi');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByText('Sign in to talk to the model.')).toBeInTheDocument());
    expect(screen.getByText('3/6 placed')).toBeInTheDocument();
  });
});
