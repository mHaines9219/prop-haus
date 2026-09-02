import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractorCard, type Contractor } from './contractor-card';

// One crew card: rate / skills / bio rendering, and the inline
// request-to-hire form that POSTs to /api/crew/requests.

vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants']);
  const strip = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => !MOTION.has(k)));
  const cache = new Map<string, React.FC<any>>();
  return {
    motion: new Proxy({}, {
      get: (_t, tag) => {
        const k = String(tag);
        if (!cache.has(k)) cache.set(k, ({ children, ...p }: any) => React.createElement(k, strip(p), children));
        return cache.get(k);
      },
    }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
  };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const contractor = (over: Partial<Contractor> = {}): Contractor => ({
  id: 'c1',
  name: 'Dana Reyes',
  photo: 'https://x.test/dana.jpg',
  skills: ['set-hands', 'delivery', 'rigging'],
  city: 'LA',
  rate_low: 25000,
  rate_high: 35000,
  bio: 'Ten years on commercial sets.',
  category: 'crew',
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;

async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: 'Request crew' }));
  return {
    dates: screen.getByLabelText('Dates needed'),
    location: screen.getByLabelText('Location'),
    notes: screen.getByLabelText('Notes'),
    send: screen.getByRole('button', { name: 'Send request' }),
  };
}

const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body);

describe('ContractorCard', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the photo well, name, skill labels, rate and bio', () => {
    render(<ContractorCard contractor={contractor()} />);
    expect(screen.getByRole('img', { name: 'Dana Reyes' })).toHaveClass('object-cover');
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument();
    expect(screen.getByText('Set hands')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('rigging')).toBeInTheDocument();
    expect(screen.getByText('$250–$350/day')).toBeInTheDocument();
    expect(screen.getByText('Ten years on commercial sets.')).toBeInTheDocument();
  });

  it.each([
    [null, null, 'Rate on request'],
    [30000, 30000, '$300/day'],
    [30000, null, '$300/day'],
    [null, 45000, '$450/day'],
    [120000, 250000, '$1,200–$2,500/day'],
  ])('formats rate %s–%s as %s', (low, high, expected) => {
    render(<ContractorCard contractor={contractor({ rate_low: low, rate_high: high })} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('copes with no photo, no bio and no skills', () => {
    render(<ContractorCard contractor={contractor({ photo: null, bio: null, skills: [] })} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getAllByText('Dana Reyes')).toHaveLength(2);
    expect(screen.queryByText('Ten years on commercial sets.')).toBeNull();
  });

  it('opens and cancels the request form', async () => {
    render(<ContractorCard contractor={contractor()} />);
    expect(screen.queryByLabelText('Dates needed')).toBeNull();
    await openForm();
    expect(screen.getByLabelText('Dates needed')).toHaveAttribute('placeholder', 'e.g. Sep 12, Sep 15–17');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Dates needed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Request crew' })).toBeInTheDocument();
  });

  it('posts the request and settles into the sent state', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    render(<ContractorCard contractor={contractor()} />);
    const f = await openForm();
    await userEvent.type(f.dates, '2026-09-12, 2026-09-15;2026-09-16');
    await userEvent.type(f.location, 'Stage 4');
    await userEvent.type(f.notes, 'Call time 6am');
    await userEvent.click(f.send);

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/crew/requests');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      contractor_id: 'c1',
      requested_dates: ['2026-09-12', '2026-09-15', '2026-09-16'],
      location: 'Stage 4',
      notes: 'Call time 6am',
    });

    resolve(json({ id: 'r1' }));
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Request crew|Cancel|Send/ })).toBeNull();
  });

  it('omits empty location and notes and sends no dates for an empty field', async () => {
    render(<ContractorCard contractor={contractor()} />);
    const f = await openForm();
    await userEvent.click(f.send);
    await screen.findByText(/Request sent/);
    expect(lastBody()).toEqual({ contractor_id: 'c1', requested_dates: [] });
  });

  // Observed: "Sep 12, Sep 15–17" is split on whitespace as well as commas, so
  // the placeholder's own example reaches the API as ['Sep','12','Sep','15–17'].
  it.fails('keeps a date phrase together when splitting the date list', async () => {
    render(<ContractorCard contractor={contractor()} />);
    const f = await openForm();
    await userEvent.type(f.dates, 'Sep 12, Sep 15–17');
    await userEvent.click(f.send);
    await screen.findByText(/Request sent/);
    expect(lastBody().requested_dates).toEqual(['Sep 12', 'Sep 15–17']);
  });

  it('shows the server error, keeps the form open, and allows a retry', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Pick at least one date' }, 400));
    render(<ContractorCard contractor={contractor()} />);
    const f = await openForm();
    await userEvent.click(f.send);
    expect(await screen.findByText('Pick at least one date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/Request sent/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to generic messages for non-JSON failures and network errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 500 }));
    render(<ContractorCard contractor={contractor()} />);
    const f = await openForm();
    await userEvent.click(f.send);
    expect(await screen.findByText('Request failed')).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  it('leaves the form pending and shows no error while redirecting on 401', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'auth' }, 401));
    render(<ContractorCard contractor={contractor()} />);
    const f = await openForm();
    await userEvent.click(f.send);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.queryByText('auth')).toBeNull();
  });
});
