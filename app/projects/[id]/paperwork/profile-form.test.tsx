import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('ProfileForm, row by row', () => {
  async function saveAndRead(fetchMock: ReturnType<typeof vi.fn>, user: ReturnType<typeof userEvent.setup>) {
    await user.click(saveButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    return sent(fetchMock).body;
  }

  it('text rows commit on Enter or blur, trimmed, and an emptied row is forgotten', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{ locations: { country: 'US' } }} provider="mock" />);

    await user.type(screen.getByLabelText('City'), '  Brooklyn {Enter}');
    await user.type(screen.getByLabelText('State or region'), 'NY');
    await user.tab();
    await user.clear(screen.getByLabelText('Country'));
    await user.tab();
    expect(screen.getByLabelText('City')).toHaveValue('Brooklyn');

    expect(await saveAndRead(fetchMock, user)).toEqual({ locations: { city: 'Brooklyn', region: 'NY' }, unset: ['locations.country'] });
  });

  it('a blur with nothing changed commits nothing', async () => {
    const user = userEvent.setup();
    render(<ProfileForm projectId="p1" initialProfile={{ locations: { city: 'Brooklyn', count: 2 } }} provider="mock" />);
    await user.click(screen.getByLabelText('City'));
    await user.click(screen.getByLabelText('Number of locations'));
    await user.tab();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Everything is saved.')).toBeInTheDocument();
  });

  it('number rows round, hold to their minimum, and forget when emptied', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{ cast: { count: 4 } }} provider="mock" />);

    await user.type(screen.getByLabelText('Shoot days'), '0{Enter}');
    await user.type(screen.getByLabelText('Number of locations'), '2.6');
    await user.tab();
    await user.type(screen.getByLabelText('Vendor count'), '3');
    await user.tab();
    await user.clear(screen.getByLabelText('Cast count'));
    await user.tab();

    expect(screen.getByLabelText('Shoot days')).toHaveValue(1);
    expect(screen.getByLabelText('Number of locations')).toHaveValue(3);
    expect(await saveAndRead(fetchMock, user)).toEqual({
      schedule: { shootDays: 1 },
      locations: { count: 3 },
      rentals: { vendorCount: 3 },
      unset: ['cast.count'],
    });
  });

  it('date rows commit as they change, and a cleared date is forgotten', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{ schedule: { start: '2026-12-01' } }} provider="mock" />);

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-09' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } });
    expect(screen.getByLabelText('End date')).toHaveValue('2026-12-09');

    expect(await saveAndRead(fetchMock, user)).toEqual({ schedule: { end: '2026-12-09' }, unset: ['schedule.start'] });
  });

  it('yes and no are both definite answers, distinct from unknown', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);

    const answer = (group: string, choice: 'Yes' | 'No') => user.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: choice }));
    await answer('Public property', 'No');
    await answer('Contractors', 'Yes');
    await answer('Union', 'No');
    await answer('Rented trucks', 'Yes');
    await answer('Picture vehicles', 'No');
    expect(within(screen.getByRole('radiogroup', { name: 'Union' })).getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true');

    expect(await saveAndRead(fetchMock, user)).toEqual({
      locations: { publicProperty: false },
      crew: { contractors: true, union: false },
      vehicles: { rentedTrucks: true, pictureVehicles: false },
    });
  });

  it('venue and client rows open with the facts that make them relevant and save like the rest', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{ productionType: 'commercial', locations: { kinds: ['venue'] } }} provider="mock" />);

    await user.type(screen.getByLabelText('Venue name'), 'The Ambassador{Enter}');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Venue needs a COI' })).getByRole('radio', { name: 'Yes' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Install and strike' })).getByRole('radio', { name: 'No' }));
    await user.type(screen.getByLabelText('Client name'), 'Acme{Enter}');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Billing a client' })).getByRole('radio', { name: 'Yes' }));

    expect(await saveAndRead(fetchMock, user)).toEqual({
      productionType: 'commercial',
      locations: { kinds: ['venue'] },
      venue: { name: 'The Ambassador', requiresCoi: true, installStrike: false },
      client: { name: 'Acme', billable: true },
    });
  });

  it('"nothing rented" is a no-op once every rental is already no', async () => {
    const user = userEvent.setup();
    render(<ProfileForm projectId="p1" initialProfile={{ rentals: { props: false, furniture: false, equipment: false } }} provider="mock" />);
    const renting = screen.getByRole('group', { name: 'Renting' });
    const none = within(renting).getByRole('checkbox', { name: 'Nothing rented' });
    expect(none).toHaveAttribute('aria-checked', 'true');
    await user.click(none);
    expect(none).toHaveAttribute('aria-checked', 'true');
    expect(saveButton()).toBeDisabled();

    await user.click(within(renting).getByRole('checkbox', { name: 'Props' }));
    expect(within(renting).getByRole('checkbox', { name: 'Props' })).toHaveAttribute('aria-checked', 'true');
    expect(none).toHaveAttribute('aria-checked', 'false');
  });

  it('Shift+Enter in the description adds a line instead of sending it', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => patched());
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);
    const description = screen.getByLabelText('Describe the production');
    await user.type(description, 'A film{Shift>}{Enter}{/Shift}in Brooklyn');
    expect(description).toHaveValue('A film\nin Brooklyn');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports nothing left to ask once every gap is answered', () => {
    render(
      <ProfileForm
        projectId="p1"
        initialProfile={{
          productionType: 'film',
          schedule: { start: '2026-12-01', end: '2026-12-05' },
          locations: { city: 'Brooklyn', publicProperty: false },
          crew: { count: 10 },
          cast: { minors: false },
          rentals: { props: true },
          vehicles: { rentedTrucks: false },
          risks: { stunts: false, specialEffects: false, pyrotechnics: false, weapons: false, animals: false, drones: false },
        }}
        provider="mock"
      />,
    );
    expect(screen.getByText('Nothing left to ask')).toBeInTheDocument();
    expect(screen.queryByLabelText('still open')).not.toBeInTheDocument();
  });

  it('keeps radius 0 on every control', () => {
    const { container } = render(<ProfileForm projectId="p1" initialProfile={{ locations: { kinds: ['venue'] }, productionType: 'commercial' }} provider="mock" />);
    for (const el of container.querySelectorAll('*')) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\brounded-(?!full)/);
    }
  });
});

describe('ProfileForm, signed out mid-edit', () => {
  beforeEach(() => {
    nav.pathname = '/projects/p1/paperwork';
  });

  it('a save that comes back 401 sends the user to sign in and back here, without refreshing', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'unauthorized' }, 401)));
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);
    await user.click(screen.getByRole('radio', { name: 'Film' }));
    await user.click(generateButton());
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/login?next=%2Fprojects%2Fp1%2Fpaperwork'));
    expect(nav.router.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('That did not save. Try again.')).not.toBeInTheDocument();
  });

  it('a description read that comes back 401 does the same', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'unauthorized' }, 401)));
    render(<ProfileForm projectId="p1" initialProfile={{}} provider="mock" />);
    await user.type(screen.getByLabelText('Describe the production'), 'A film{Enter}');
    await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith('/login?next=%2Fprojects%2Fp1%2Fpaperwork'));
    expect(screen.queryByText('That did not go through. Try again.')).not.toBeInTheDocument();
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
