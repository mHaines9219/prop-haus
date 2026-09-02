import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { IntakePanel } from './intake-panel';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const turn = {
  reply: 'Noted: Film, crew 15. Any shooting on public property?',
  questions: [{ key: 'locations.publicProperty', question: 'Any shooting on public property?', priority: 8 }],
  profile: { productionType: 'film', crew: { count: 15 } },
  facts: [
    { label: 'Type', value: 'Film' },
    { label: 'Crew', value: '15' },
  ],
  checklist: { items: [], advisories: [], summary: { total: 0, complete: 0, open: 0, needsInformation: 0 } },
  provider: 'mock',
};

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('IntakePanel', () => {
  it('starts empty with the mock badge and no profile', () => {
    render(<IntakePanel projectId="p1" initialMessages={[]} initialFacts={[]} initialQuestions={[]} provider="mock" />);
    expect(screen.getByText('Nothing described yet')).toBeInTheDocument();
    expect(screen.getByText('Mock intake')).toBeInTheDocument();
    expect(screen.getByText('Nothing on file yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('renders the transcript, the facts, and the open questions it was given', () => {
    render(
      <IntakePanel
        projectId="p1"
        initialMessages={[
          { id: 'm1', role: 'user', content: 'A film in Brooklyn' },
          { id: 'm2', role: 'assistant', content: 'Noted. How many crew?' },
        ]}
        initialFacts={[{ label: 'Where', value: 'Brooklyn, NY' }]}
        initialQuestions={['How many crew?']}
        provider="openrouter"
      />,
    );
    expect(screen.getByText('A film in Brooklyn')).toBeInTheDocument();
    expect(screen.getByText('Noted. How many crew?')).toBeInTheDocument();
    expect(screen.getByText('Brooklyn, NY')).toBeInTheDocument();
    expect(screen.getByText('Still open')).toBeInTheDocument();
    expect(screen.queryByText('Mock intake')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Describe the production')).toHaveAttribute('placeholder', 'How many crew?');
  });

  it('sends a message, shows the reply and the new facts, and refreshes the page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json(turn));
    vi.stubGlobal('fetch', fetchMock);
    render(<IntakePanel projectId="p1" initialMessages={[]} initialFacts={[]} initialQuestions={[]} provider="mock" />);

    await user.type(screen.getByLabelText('Describe the production'), 'A film with 15 crew');
    await user.keyboard('{Enter}');

    expect(await screen.findByText(turn.reply)).toBeInTheDocument();
    expect(screen.getByText('A film with 15 crew')).toBeInTheDocument();
    expect(screen.getByText('Film')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Any shooting on public property?')).toBeInTheDocument();
    expect(nav.router.refresh).toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/projects/p1/intake');
    expect(JSON.parse(init.body as string)).toEqual({ message: 'A film with 15 crew' });
    expect(screen.getByLabelText('Describe the production')).toHaveValue('');
  });

  it('keeps the draft and shows an error when the turn fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'down' }, 500)));
    render(<IntakePanel projectId="p1" initialMessages={[]} initialFacts={[]} initialQuestions={[]} provider="mock" />);

    await user.type(screen.getByLabelText('Describe the production'), 'A film');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('That did not go through. Try again.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Describe the production')).toHaveValue('A film'));
    expect(nav.router.refresh).not.toHaveBeenCalled();
  });
});
