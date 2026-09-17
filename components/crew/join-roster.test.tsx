import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREW_COPY } from '@/lib/crew';
import { JoinRoster } from './join-roster';

// "Join the roster" opens the application modal; the form needs a name, an
// email and a headshot, allows up to 5 work photos, and POSTs multipart
// form data to /api/crew/roster-applications.

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

const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

let fetchMock: ReturnType<typeof vi.fn>;

async function openModal() {
  render(<JoinRoster />);
  await userEvent.click(screen.getByRole('button', { name: CREW_COPY.joinCta }));
  // The modal autofocuses the name field after 50ms; typing before that loses focus mid-word.
  await waitFor(() => expect(screen.getByPlaceholderText('Your name')).toHaveFocus());
  return screen.getByRole('dialog');
}

async function fillRequired() {
  await userEvent.type(screen.getByPlaceholderText('Your name'), 'Dana Reyes');
  await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'dana@example.com');
  await userEvent.type(screen.getByPlaceholderText('yourportfolio.com'), 'danareyes.com');
  await userEvent.type(screen.getByPlaceholderText('@handle or link'), '@danaonset');
  await userEvent.upload(screen.getByLabelText('Add headshot'), image('dana.jpg'));
  await userEvent.upload(screen.getByLabelText(/Add work photos/), image('set-1.jpg'));
}

const sentForm = () => fetchMock.mock.calls[0][1].body as FormData;

describe('JoinRoster', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async () => json({ ok: true }, 201));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the modal from the button and closes it again', async () => {
    await openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps submit disabled until every field is filled', async () => {
    await openModal();
    const submit = screen.getByRole('button', { name: 'Send application' });
    expect(submit).toBeDisabled();
    // one field short (no work photo yet) is still not enough
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Dana Reyes');
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'dana@example.com');
    await userEvent.type(screen.getByPlaceholderText('yourportfolio.com'), 'danareyes.com');
    await userEvent.type(screen.getByPlaceholderText('@handle or link'), '@danaonset');
    await userEvent.upload(screen.getByLabelText('Add headshot'), image('dana.jpg'));
    expect(submit).toBeDisabled();
    await userEvent.upload(screen.getByLabelText(/Add work photos/), image('set-1.jpg'));
    expect(submit).toBeEnabled();
  });

  it('posts the application as form data and shows the sent state', async () => {
    await openModal();
    await fillRequired();
    await userEvent.upload(screen.getByLabelText(/Add work photos/), image('set-2.jpg'));
    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));

    expect(await screen.findByText(/Application sent/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/crew/roster-applications');
    expect(init.method).toBe('POST');
    const fd = sentForm();
    expect(fd.get('name')).toBe('Dana Reyes');
    expect(fd.get('email')).toBe('dana@example.com');
    expect(fd.get('website')).toBe('danareyes.com');
    expect(fd.get('social')).toBe('@danaonset');
    expect(fd.get('company')).toBe(''); // honeypot untouched
    expect((fd.get('headshot') as File).name).toBe('dana.jpg');
    expect(fd.getAll('photos').map((f) => (f as File).name)).toEqual(['set-1.jpg', 'set-2.jpg']);
  });

  it('caps work photos at 5 and says so', async () => {
    await openModal();
    const addPhotos = screen.getByLabelText(/Add work photos/);
    await userEvent.upload(addPhotos, Array.from({ length: 6 }, (_, i) => image(`w${i}.jpg`)));
    expect(screen.getAllByLabelText(/^Remove w/)).toHaveLength(5);
    expect(screen.getByText(/only 5 work photos/)).toBeInTheDocument();
  });

  it('allows removing a picked photo', async () => {
    await openModal();
    const addPhotos = screen.getByLabelText(/Add work photos/);
    await userEvent.upload(addPhotos, [image('set-1.jpg')]);
    expect(screen.getByLabelText('Remove set-1.jpg')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Remove set-1.jpg'));
    expect(screen.queryByLabelText('Remove set-1.jpg')).toBeNull();
  });

  it('shows the server error and lets the user retry', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Images total over 20 MB' }, 400));
    await openModal();
    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('Images total over 20 MB')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText(/Application sent/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
