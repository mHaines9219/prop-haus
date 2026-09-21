import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { ProfileForm, forgottenPaths } from './profile-form';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const empty = { items: [], advisories: [], summary: { total: 0, complete: 0, open: 0, needsInformation: 0 } };
const patched = () => json({ profile: {}, facts: [], questions: [], checklist: empty });

/** The nth fetch call, parsed. */
function sent(fetchMock: ReturnType<typeof vi.fn>, n = 0): { url: string; method: string; body: unknown } {
  const [url, init] = fetchMock.mock.calls[n] as unknown as [string, RequestInit];
  return { url, method: init.method ?? 'GET', body: JSON.parse(init.body as string) };
}

const saveButton = () => screen.getByRole('button', { name: 'Save' });
const generateButton = () => screen.getByRole('button', { name: 'Generate paperwork checklist' });

beforeEach(() => resetNavigation());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProfileForm', () => {
  it('starts empty: mock badge, nine open facts, nothing to save yet', () => {
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);
    expect(screen.getByText('Tell us about the production')).toBeInTheDocument();
    expect(screen.getByText('Mock intake')).toBeInTheDocument();
    expect(screen.getByText('9 still open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill it in' })).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(generateButton()).toBeEnabled();
    expect(screen.getByText('Everything is saved.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Film' })).toHaveAttribute('aria-checked', 'false');
    // Venue and client rows wait until they are relevant.
    expect(screen.queryByRole('radiogroup', { name: 'Venue needs a COI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Billing a client' })).not.toBeInTheDocument();
  });

  it('reflects the profile it was given', () => {
    render(
      <ProfileForm
        projectId="p1"
        initialProfile={{ productionType: 'commercial', crew: { count: 15 }, cast: { minors: true }, locations: { kinds: ['venue'] }, facts: ['Two-camera shoot'] }}
        provider="openrouter"
      />,
    );
    expect(screen.queryByText('Mock intake')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Commercial' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Crew count')).toHaveValue(15);
    expect(within(screen.getByRole('radiogroup', { name: 'Minors on set' })).getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Venue needs a COI' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Billing a client' })).toBeInTheDocument();
    expect(screen.getByText('Two-camera shoot')).toBeInTheDocument();
  });

  it('keeps edits on the page until Save, then writes them without touching the checklist', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);

    await user.click(screen.getByRole('radio', { name: 'Film' }));
    await user.type(screen.getByLabelText('Crew count'), '15');
    await user.tab();
    await user.click(within(screen.getByRole('group', { name: 'Location kinds' })).getByRole('checkbox', { name: 'Venue' }));

    expect(screen.getByRole('radio', { name: 'Film' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('8 still open')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Venue needs a COI' })).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(saveButton());
    await waitFor(() => expect(screen.getByText('Everything is saved.')).toBeInTheDocument());
    expect(sent(fetchMock)).toEqual({
      url: '/api/projects/p1/profile',
      method: 'PATCH',
      body: { productionType: 'film', crew: { count: 15 }, locations: { kinds: ['venue'] } },
    });
    expect(nav.router.refresh).not.toHaveBeenCalled();
    expect(saveButton()).toBeDisabled();
  });

  it('Generate saves what is pending and then refreshes the checklist; with nothing pending it only refreshes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);

    await user.click(generateButton());
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('radiogroup', { name: 'Minors on set' })).getByRole('radio', { name: 'Yes' }));
    await user.click(generateButton());
    await waitFor(() => expect(nav.router.refresh).toHaveBeenCalledTimes(2));
    expect(sent(fetchMock).body).toEqual({ cast: { minors: true } });
    expect(screen.getByText('Everything is saved.')).toBeInTheDocument();
  });

  it('a cleared answer is sent as a path to forget', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{ cast: { minors: true, count: 2 }, productionType: 'film', locations: { kinds: ['venue'] } }} provider="mock" />);

    const minors = screen.getByRole('radiogroup', { name: 'Minors on set' });
    await user.click(within(minors).getByRole('radio', { name: 'Yes' }));
    expect(within(minors).getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('radio', { name: 'Film' }));
    await user.click(within(screen.getByRole('group', { name: 'Location kinds' })).getByRole('checkbox', { name: 'Venue' }));

    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock).body).toEqual({ cast: { count: 2 }, unset: ['cast.minors', 'productionType', 'locations.kinds'] });
  });

  it('"none of these" answers every risk with a definite no', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);

    const risks = screen.getByRole('group', { name: 'Risks' });
    await user.click(within(risks).getByRole('checkbox', { name: 'None of these' }));
    expect(within(risks).getByRole('checkbox', { name: 'None of these' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('8 still open')).toBeInTheDocument();

    await user.click(within(risks).getByRole('checkbox', { name: 'Stunts' }));
    expect(within(risks).getByRole('checkbox', { name: 'None of these' })).toHaveAttribute('aria-checked', 'false');

    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent(fetchMock).body).toEqual({
      risks: { stunts: true, specialEffects: false, pyrotechnics: false, weapons: false, animals: false, drones: false },
    });
  });

  it('fills the form from a description through the intake route, leaving nothing to save', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      json({
        reply: 'Noted.',
        questions: [],
        profile: { productionType: 'film', crew: { count: 15 }, locations: { city: 'Brooklyn' } },
        facts: [],
        checklist: empty,
        provider: 'mock',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);

    await user.type(screen.getByLabelText('Describe the production'), 'A film in Brooklyn with 15 crew');
    await user.click(screen.getByRole('button', { name: 'Fill it in' }));

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Film' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByLabelText('Crew count')).toHaveValue(15);
    expect(screen.getByLabelText('City')).toHaveValue('Brooklyn');
    expect(screen.getByLabelText('Describe the production')).toHaveValue('');
    expect(saveButton()).toBeDisabled();
    expect(nav.router.refresh).not.toHaveBeenCalled();
    expect(sent(fetchMock)).toEqual({ url: '/api/projects/p1/intake', method: 'POST', body: { message: 'A film in Brooklyn with 15 crew' } });
  });

  it('says so when a save fails and keeps the edits; keeps the description when a read fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'down' }, 500)));
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);

    await user.click(screen.getByRole('radio', { name: 'Film' }));
    await user.click(saveButton());
    expect(await screen.findByText('That did not save. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Film' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument();
    expect(nav.router.refresh).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Describe the production'), 'A film');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('That did not go through. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Describe the production')).toHaveValue('A film');
  });
});

describe('forgottenPaths', () => {
  it('names the fields the draft dropped, one level deep, and never facts', () => {
    expect(
      forgottenPaths(
        { productionType: 'film', summary: 'x', crew: { count: 4, union: true }, risks: { stunts: true }, facts: ['a'] },
        { crew: { count: 4 }, summary: 'x' },
      ),
    ).toEqual(['productionType', 'crew.union', 'risks.stunts']);
    expect(forgottenPaths({}, { productionType: 'film' })).toEqual([]);
  });
});
