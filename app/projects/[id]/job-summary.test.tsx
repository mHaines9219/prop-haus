import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { JobSummary } from './job-summary';

// The Job Summary box: a textarea seeded with the saved summary, a Save that
// only lights up once the draft differs, a PATCH on save, and an error line
// that keeps the draft when the write fails.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('JobSummary', () => {
  it('renders the header, the box seeded with the saved summary, and a disabled Save', () => {
    render(<JobSummary projectId="p1" summary="Two-day loft shoot." />);
    expect(screen.getByRole('heading', { name: 'Job Summary' })).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Job summary' });
    expect(box).toHaveValue('Two-day loft shoot.');
    expect(box).toHaveAttribute('maxlength', '4000');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows a placeholder and no status when nothing has been written', () => {
    render(<JobSummary projectId="p1" summary="" />);
    expect(screen.getByRole('textbox', { name: 'Job summary' })).toHaveAttribute('placeholder');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('PATCHes the trimmed draft on Save and refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => json({ ok: true, summary: 'Diner scene, props due Thursday.' }));
    render(<JobSummary projectId="p1" summary="" />);
    const box = screen.getByRole('textbox', { name: 'Job summary' });
    await user.type(box, '  Diner scene, props due Thursday.  ');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/projects/p1/summary');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ summary: 'Diner scene, props due Thursday.' });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps the draft and shows an error when the write fails', async () => {
    const user = userEvent.setup();
    stubFetch(() => json({ error: 'nope' }, 500));
    render(<JobSummary projectId="p1" summary="" />);
    const box = screen.getByRole('textbox', { name: 'Job summary' });
    await user.type(box, 'Night exterior.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The summary did not save. Try again.');
    expect(box).toHaveValue('Night exterior.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
