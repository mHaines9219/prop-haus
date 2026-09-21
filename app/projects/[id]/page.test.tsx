// /projects/[id]: session gate, not-found, scene rows, the Jobs section
// (empty state, stat band, the orders table with its status control, tabs,
// search, sorting and row navigation), the Crew section (the "Need a crew?"
// button, one-line rows that expand into the contractor's profile), and the
// paperwork row's two copy states.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import { makeOrder, makeOrderItem } from '@/test/fixtures/orders';
import { summarizeOrder, type Order } from '@/lib/orders';
import type { CrewRequestRow, Job, JobsOverview } from '@/lib/jobs';
import type { Project, ProjectDocument, ProjectFolder, ProjectItem } from '@/lib/projects';
import ProjectPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/projects', async () => ({
  ...(await vi.importActual<typeof import('@/lib/projects')>('@/lib/projects')),
  getProject: vi.fn(),
}));
vi.mock('@/lib/jobs', async () => ({
  ...(await vi.importActual<typeof import('@/lib/jobs')>('@/lib/jobs')),
  getProjectJobs: vi.fn(),
}));

const projects = vi.mocked(await import('@/lib/projects'));
const jobs = vi.mocked(await import('@/lib/jobs'));

function job(order: Order): Job {
  return { ...order, projectId: 'p-1', vendorSummaries: summarizeOrder(order), messagesSent: 0 };
}

function overview(over: Partial<JobsOverview> = {}): JobsOverview {
  return {
    jobs: [],
    crew: [],
    stats: {
      ordersInFlight: 0,
      itemsPending: 0,
      itemsQuoted: 0,
      itemsConfirmed: 0,
      crewPending: 0,
      vendorsNotified: 0,
      messagesSent: 0,
      documentsPending: 0,
    },
    ...over,
  };
}

function crew(over: Partial<CrewRequestRow> = {}): CrewRequestRow {
  return {
    id: 'cr-1',
    projectId: 'p-1',
    contractorId: 'c-1',
    contractorName: 'Dana Lee',
    contractorPhoto: 'https://img.example/dana.jpg',
    contractorSkills: ['delivery', 'load-in'],
    contractorCity: 'los_angeles',
    contractorRateLow: 45000,
    contractorRateHigh: 55000,
    contractorBio: 'Cargo van owner-operator with production insurance.',
    requestedDates: ['2026-09-10T12:00:00.000Z', '2026-09-11T12:00:00.000Z'],
    location: 'Burbank',
    notes: null,
    status: 'requested',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

/** The table row that carries a link with this accessible name. */
function rowOf(name: RegExp): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr')!;
}

function item(over: Partial<ProjectItem> = {}): ProjectItem {
  return {
    itemId: 'omega-1',
    source: 'omega',
    sourceId: '1',
    name: 'Credenza',
    image: 'https://img.example/1.jpg',
    sourceUrl: 'https://omegacinemaprops.com/item/1',
    addedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function folder(over: Partial<ProjectFolder> = {}): ProjectFolder {
  return {
    id: 'f-1',
    projectId: 'p-1',
    name: 'Scene 1',
    kind: 'scene',
    position: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    items: [],
    documents: [],
    ...over,
  };
}

function doc(over: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: 'd-1',
    folderId: 'f-pw',
    name: 'coi.pdf',
    storagePath: 'x/coi.pdf',
    mime: 'application/pdf',
    sizeBytes: 1024,
    uploadedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    orgId: ORG_ID,
    profile: {},
    name: 'Nocturne',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
    folders: [folder(), folder({ id: 'f-pw', name: 'Paperwork', kind: 'paperwork', position: 1 })],
    ...over,
  };
}

function props(id = 'p-1') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  projects.getProject.mockReset();
  jobs.getProjectJobs.mockReset();
  jobs.getProjectJobs.mockResolvedValue(overview());
  resetNavigation();
});

describe('ProjectPage', () => {
  it('redirects a signed-out visitor to /login carrying the project path', async () => {
    signOut();
    await expect(ProjectPage(props('p-7'))).rejects.toThrow('/login?next=%2Fprojects%2Fp-7');
    expect(projects.getProject).not.toHaveBeenCalled();
    expect(jobs.getProjectJobs).not.toHaveBeenCalled();
  });

  it('404s when the project is not in the signed-in org', async () => {
    signIn();
    projects.getProject.mockResolvedValue(undefined);
    await expect(ProjectPage(props('other-org'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(projects.getProject).toHaveBeenCalledWith(ORG_ID, 'other-org');
  });

  it('renders the header counts, scene rows and the empty paperwork copy', async () => {
    signIn();
    projects.getProject.mockResolvedValue(
      project({
        folders: [
          folder({ items: [item(), item({ itemId: 'omega-2', sourceId: '2', name: 'Lamp', image: undefined })] }),
          folder({ id: 'f-2', name: 'Kitchen', position: 1 }),
          folder({ id: 'f-pw', name: 'Paperwork', kind: 'paperwork', position: 2 }),
        ],
      }),
    );
    render(await ProjectPage(props()));

    expect(jobs.getProjectJobs).toHaveBeenCalledWith(ORG_ID, 'p-1');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nocturne');
    expect(screen.getByText('2 scenes · 2 items · 0 documents')).toBeInTheDocument();
    // The four sections, in order.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Scenes',
      'Jobs',
      'Crew',
      'Paperwork',
    ]);

    const scene1 = screen.getByRole('link', { name: /Scene 1/ });
    expect(scene1).toHaveAttribute('href', '/projects/p-1/folders/f-1');
    expect(scene1).toHaveTextContent('2 items');
    expect(within(scene1).getAllByRole('img')).toHaveLength(1);

    const kitchen = screen.getByRole('link', { name: /Kitchen/ });
    expect(kitchen).toHaveAttribute('href', '/projects/p-1/folders/f-2');
    expect(kitchen).toHaveTextContent('0 items');
    expect(screen.queryByText('No scenes yet')).not.toBeInTheDocument();

    const paperwork = screen.getByRole('link', { name: /COIs, W9s/ });
    expect(paperwork).toHaveAttribute('href', '/projects/p-1/folders/f-pw');
    expect(paperwork).toHaveTextContent('COIs, W9s, invoices, call sheets');

    const checklist = screen.getByRole('link', { name: /Paperwork checklist/ });
    expect(checklist).toHaveAttribute('href', '/projects/p-1/paperwork');
    expect(checklist).toHaveTextContent('Describe the production to build it');
  });

  it('shows the document count once paperwork has been uploaded', async () => {
    signIn();
    projects.getProject.mockResolvedValue(
      project({
        folders: [
          folder(),
          folder({
            id: 'f-pw',
            name: 'Paperwork',
            kind: 'paperwork',
            position: 1,
            documents: [doc(), doc({ id: 'd-2', name: 'w9.pdf' })],
          }),
        ],
      }),
    );
    render(await ProjectPage(props()));
    expect(screen.getByText('1 scene · 0 items · 2 documents')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 documents/ })).toHaveAttribute('href', '/projects/p-1/folders/f-pw');
  });

  it('shows the empty scenes state and omits the paperwork section without that folder', async () => {
    signIn();
    projects.getProject.mockResolvedValue(project({ folders: [] }));
    render(await ProjectPage(props()));
    expect(screen.getByText('No scenes yet')).toBeInTheDocument();
    expect(screen.getByText('0 scenes · 0 items · 0 documents')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Paperwork' })).not.toBeInTheDocument();
  });

  describe('Jobs section', () => {
    beforeEach(() => {
      signIn();
      projects.getProject.mockResolvedValue(project());
    });

    it('shows the empty state with a way to the catalog when nothing has been ordered', async () => {
      render(await ProjectPage(props()));
      const section = screen.getByRole('region', { name: 'Jobs' });
      expect(within(section).getByText('No orders yet')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/search');
      expect(within(section).queryByText('Orders in flight')).not.toBeInTheDocument();
    });

    it('renders the stat band from the project stats', async () => {
      jobs.getProjectJobs.mockResolvedValue(
        overview({
          jobs: [job(makeOrder())],
          stats: {
            ordersInFlight: 1,
            itemsPending: 2,
            itemsQuoted: 3,
            itemsConfirmed: 4,
            crewPending: 5,
            vendorsNotified: 6,
            messagesSent: 0,
            documentsPending: 7,
          },
        }),
      );
      render(await ProjectPage(props()));
      const tile = (label: string) => screen.getByText(label).previousElementSibling;
      expect(tile('Orders in flight')).toHaveTextContent('1');
      expect(tile('Items confirmed')).toHaveTextContent('4');
      expect(tile('Vendors notified')).toHaveTextContent('6');
      expect(tile('To sign')).toHaveTextContent('7');
    });

    it('renders a job row with its link, status, rollup copy, thumbs and item count', async () => {
      const order = makeOrder({
        id: 'abcdef12-9999',
        status: 'placed',
        items: [
          makeOrderItem({ id: 'a', status: 'confirmed', name: 'Credenza' }),
          makeOrderItem({ id: 'b', status: 'pending', name: 'Lamp' }),
          makeOrderItem({ id: 'c', status: 'quoted', name: 'Rug', image: undefined }),
        ],
      });
      jobs.getProjectJobs.mockResolvedValue(overview({ jobs: [job(order)] }));
      render(await ProjectPage(props()));

      expect(screen.getByRole('link', { name: /Order #ABCDEF12/ })).toHaveAttribute('href', '/orders/abcdef12-9999');
      const row = rowOf(/Order #ABCDEF12/);
      expect(row).toHaveTextContent('PLACED');
      expect(within(row).getByRole('combobox', { name: 'Status for order #ABCDEF12' })).toHaveValue('active');
      expect(row).toHaveTextContent('Omega Cinema Props confirmed 1 of 3 items. 2 pending.');
      expect(within(row).getByRole('cell', { name: /^3 1 confirmed$/ })).toBeInTheDocument();
      expect(within(row).getByRole('cell', { name: /^1 not sent$/ })).toBeInTheDocument();
      expect(within(row).getAllByRole('img')).toHaveLength(2);
    });

    it('navigates to the order when the row itself is clicked, but not from a link', async () => {
      jobs.getProjectJobs.mockResolvedValue(overview({ jobs: [job(makeOrder({ id: 'order-9' }))] }));
      render(await ProjectPage(props()));
      const row = rowOf(/Order #ORDER-9/);

      await userEvent.click(within(row).getByText('PLACED'));
      expect(nav.router.push).toHaveBeenCalledWith('/orders/order-9');

      nav.router.push.mockClear();
      await userEvent.click(within(row).getByRole('link', { name: /Order #ORDER-9/ }));
      expect(nav.router.push).not.toHaveBeenCalled();
    });

    it('filters orders by the status tabs and the search box', async () => {
      jobs.getProjectJobs.mockResolvedValue(
        overview({
          jobs: [
            job(makeOrder({ id: 'aaaa-1', status: 'placed', jobStatus: 'active' })),
            job(
              makeOrder({
                id: 'bbbb-2',
                status: 'confirmed',
                jobStatus: 'done',
                items: [makeOrderItem({ id: 'x', vendor: 'Newel', status: 'confirmed' })],
              }),
            ),
            job(makeOrder({ id: 'cccc-3', status: 'processing', jobStatus: 'active' })),
          ],
        }),
      );
      render(await ProjectPage(props()));

      const tabs = screen.getByRole('tablist', { name: 'Filter orders by status' });
      expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['All3', 'Active2', 'Pending0', 'Done1']);
      expect(screen.getAllByRole('link', { name: /Order #/ })).toHaveLength(3);

      await userEvent.click(within(tabs).getByRole('tab', { name: /Done/ }));
      expect(screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent)).toEqual(['Order #BBBB-2']);

      await userEvent.click(within(tabs).getByRole('tab', { name: /^All/ }));
      const search = screen.getByRole('searchbox', { name: 'Search orders' });
      await userEvent.type(search, 'newel');
      expect(screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent)).toEqual(['Order #BBBB-2']);

      await userEvent.clear(search);
      await userEvent.type(search, 'zzzz');
      expect(screen.getByText('No orders match that filter.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(screen.getAllByRole('link', { name: /Order #/ })).toHaveLength(3);
    });

    it('sorts by the most recent update first and flips when a header is clicked', async () => {
      jobs.getProjectJobs.mockResolvedValue(
        overview({
          jobs: [
            job(makeOrder({ id: 'old-1', status: 'confirmed', updatedAt: '2026-08-01T00:00:00.000Z' })),
            job(makeOrder({ id: 'new-2', status: 'placed', updatedAt: '2026-09-02T00:00:00.000Z' })),
            job(makeOrder({ id: 'mid-3', status: 'processing', updatedAt: '2026-08-20T00:00:00.000Z' })),
          ],
        }),
      );
      render(await ProjectPage(props()));
      const codes = () => screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent);
      expect(codes()).toEqual(['Order #NEW-2', 'Order #MID-3', 'Order #OLD-1']);
      await userEvent.click(screen.getByRole('button', { name: 'Updated' }));
      expect(codes()).toEqual(['Order #OLD-1', 'Order #MID-3', 'Order #NEW-2']);
    });

    it('lets the user set a status from the row: the write goes out and the tabs recount', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        jobs.getProjectJobs.mockResolvedValue(
          overview({ jobs: [job(makeOrder({ id: 'aaaa-1', jobStatus: 'active' })), job(makeOrder({ id: 'bbbb-2', jobStatus: 'active' }))] }),
        );
        render(await ProjectPage(props()));
        const tabs = screen.getByRole('tablist', { name: 'Filter orders by status' });
        const tabText = () => within(tabs).getAllByRole('tab').map((t) => t.textContent);
        expect(tabText()).toEqual(['All2', 'Active2', 'Pending0', 'Done0']);

        await userEvent.click(within(tabs).getByRole('tab', { name: /Active/ }));
        const select = within(rowOf(/Order #AAAA-1/)).getByRole('combobox', { name: 'Status for order #AAAA-1' });
        await userEvent.selectOptions(select, 'done');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('/api/orders/aaaa-1/status');
        expect(init?.method).toBe('PATCH');
        expect(JSON.parse(String(init?.body))).toEqual({ jobStatus: 'done' });
        expect(screen.getAllByRole('link', { name: /Order #/ }).map((l) => l.textContent)).toEqual(['Order #BBBB-2']);
        expect(tabText()).toEqual(['All2', 'Active1', 'Pending0', 'Done1']);
        await vi.waitFor(() => expect(nav.router.refresh).toHaveBeenCalled());
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('Crew section', () => {
    beforeEach(() => {
      signIn();
      projects.getProject.mockResolvedValue(project());
    });

    it('offers "Need a crew?" into /crew for this project when no crew has been requested', async () => {
      render(await ProjectPage(props()));
      const section = screen.getByRole('region', { name: 'Crew' });
      expect(within(section).getByText('No crew on this project')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: 'Need a crew?' })).toHaveAttribute('href', '/crew?project=p-1');
      expect(within(section).queryByRole('link', { name: 'Request more crew' })).not.toBeInTheDocument();
    });

    it('lists each request as a one-line summary that expands into the contractor profile', async () => {
      jobs.getProjectJobs.mockResolvedValue(
        overview({
          crew: [
            crew({ notes: 'Call time 6am, ask for Sam.' }),
            crew({
              id: 'cr-2',
              contractorName: 'Ravi Patel',
              contractorPhoto: null,
              contractorSkills: [],
              contractorCity: null,
              contractorRateLow: null,
              contractorRateHigh: null,
              contractorBio: null,
              requestedDates: [],
              location: null,
              status: 'declined',
            }),
          ],
        }),
      );
      render(await ProjectPage(props()));
      const section = screen.getByRole('region', { name: 'Crew' });
      expect(within(section).getByRole('link', { name: 'Request more crew' })).toHaveAttribute('href', '/crew?project=p-1');

      // Collapsed: name, status, dates and location only. No photo, no bio.
      const dana = within(section).getByRole('button', { name: /Dana Lee/ });
      expect(dana).toHaveAttribute('aria-expanded', 'false');
      expect(dana).toHaveTextContent('REQUESTED');
      expect(dana).toHaveTextContent(/Sep \d+, 2026, Sep \d+, 2026 · Burbank/);
      expect(within(section).queryByRole('img')).not.toBeInTheDocument();
      expect(within(section).queryByText(/Cargo van/)).not.toBeInTheDocument();

      const ravi = within(section).getByRole('button', { name: /Ravi Patel/ });
      expect(ravi).toHaveTextContent('DECLINED');
      expect(ravi).toHaveTextContent('Dates on request');

      // Expanded: the full profile and the request.
      await userEvent.click(dana);
      expect(dana).toHaveAttribute('aria-expanded', 'true');
      const details = document.getElementById(dana.getAttribute('aria-controls')!)!;
      expect(within(details).getByRole('img', { name: 'Dana Lee' })).toBeInTheDocument();
      expect(within(details).getByText('$450–$550/day')).toBeInTheDocument();
      expect(within(details).getByText('Los Angeles')).toBeInTheDocument();
      expect(within(details).getByRole('list', { name: 'Skills' })).toHaveTextContent('DeliveryLoad-in');
      expect(within(details).getByText(/Cargo van owner-operator/)).toBeInTheDocument();
      expect(within(details).getByText('Burbank')).toBeInTheDocument();
      expect(within(details).getByText('Call time 6am, ask for Sam.')).toBeInTheDocument();
      expect(within(details).getByText(/^Sep \d+, 2026$/)).toBeInTheDocument();

      // Rows open independently, and close again.
      await userEvent.click(ravi);
      expect(ravi).toHaveAttribute('aria-expanded', 'true');
      const raviDetails = document.getElementById(ravi.getAttribute('aria-controls')!)!;
      expect(within(raviDetails).getByText('Rate on request')).toBeInTheDocument();
      expect(within(raviDetails).getByText('Not given')).toBeInTheDocument();
      expect(within(raviDetails).queryByRole('list', { name: 'Skills' })).not.toBeInTheDocument();
      expect(dana).toHaveAttribute('aria-expanded', 'true');

      await userEvent.click(dana);
      expect(dana).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById('crew-cr-1-details')).toBeNull();
    });
  });
});
