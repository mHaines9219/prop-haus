// /projects dashboard: session gate, archived toggle, empty states, and the
// sortable, searchable table with one row per production.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nav, resetNavigation } from '@/test/mocks/next-navigation';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import type { Project, ProjectDocument, ProjectFolder, ProjectItem } from '@/lib/projects';
import ProjectsPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('./archive-button', () => ({
  ArchiveButton: ({ projectId, isArchived }: { projectId: string; isArchived: boolean }) => (
    <button data-testid={`archive-${projectId}`}>{isArchived ? 'Restore' : 'Archive'}</button>
  ),
}));
vi.mock('@/lib/projects', async () => ({
  ...(await vi.importActual<typeof import('@/lib/projects')>('@/lib/projects')),
  listProjects: vi.fn(),
}));

const projects = vi.mocked(await import('@/lib/projects'));

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

function props(archived?: string) {
  return { searchParams: Promise.resolve(archived === undefined ? {} : { archived }) };
}

beforeEach(() => {
  projects.listProjects.mockReset();
  projects.listProjects.mockResolvedValue([]);
  resetNavigation();
});

describe('ProjectsPage', () => {
  it('redirects a signed-out visitor to /login with next=/projects', async () => {
    signOut();
    await expect(ProjectsPage(props())).rejects.toThrow('/login?next=%2Fprojects');
    expect(projects.listProjects).not.toHaveBeenCalled();
  });

  it('lists active projects for the org by default', async () => {
    signIn();
    render(await ProjectsPage(props()));
    expect(projects.listProjects).toHaveBeenCalledWith(ORG_ID, { includeArchived: false });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your projects');
    expect(screen.getByRole('link', { name: 'Show archived' })).toHaveAttribute('href', '/projects?archived=1');
    expect(screen.getByText('No active projects')).toBeInTheDocument();
  });

  it('includes archived projects with ?archived=1', async () => {
    signIn();
    render(await ProjectsPage(props('1')));
    expect(projects.listProjects).toHaveBeenCalledWith(ORG_ID, { includeArchived: true });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All projects');
    expect(screen.getByRole('link', { name: 'Hide archived' })).toHaveAttribute('href', '/projects');
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });

  it('renders each project row with counts, filmstrip, date and archive control', async () => {
    signIn();
    projects.listProjects.mockResolvedValue([
      project({
        folders: [
          folder({ items: [item(), item({ itemId: 'omega-2', sourceId: '2', name: 'Lamp' })] }),
          folder({ id: 'f-2', name: 'Scene 2', position: 1, items: [item({ itemId: 'omega-3', image: undefined })] }),
          folder({ id: 'f-pw', name: 'Paperwork', kind: 'paperwork', position: 2, documents: [doc()] }),
        ],
      }),
      project({
        id: 'p-2',
        name: 'Archived Short',
        archivedAt: '2026-08-01T00:00:00.000Z',
        folders: [folder({ id: 'f-9', projectId: 'p-2' })],
      }),
    ]);
    render(await ProjectsPage(props('1')));

    expect(screen.getByRole('link', { name: 'Nocturne' })).toHaveAttribute('href', '/projects/p-1');
    const row = screen.getByRole('link', { name: 'Nocturne' }).closest('tr')!;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells.slice(1, 4)).toEqual(['2', '3', '1']);
    expect(within(row).getAllByRole('img')).toHaveLength(2);
    expect(within(row).getByTestId('archive-p-1')).toHaveTextContent('Archive');

    const archived = screen.getByRole('link', { name: 'Archived Short' }).closest('tr')!;
    expect(within(archived).getAllByRole('cell').map((c) => c.textContent).slice(1, 4)).toEqual(['1', '0', '0']);
    expect(within(archived).queryAllByRole('img')).toHaveLength(0);
    expect(within(archived).getByText('Archived')).toBeInTheDocument();
    expect(within(archived).getByTestId('archive-p-2')).toHaveTextContent('Restore');
    expect(screen.getAllByText(/Sep \d+$/)).toHaveLength(2);

    // Column headers are the sort controls; the archive column has no visible label.
    expect(screen.getAllByRole('button', { name: /^(Project|Scenes|Items|Documents|Updated)$/ })).toHaveLength(5);
  });

  it('sorts by last update, re-sorts by name on demand, searches by name and opens a row on click', async () => {
    signIn();
    projects.listProjects.mockResolvedValue([
      project({ id: 'p-1', name: 'Nocturne', updatedAt: '2026-08-10T00:00:00.000Z' }),
      project({ id: 'p-2', name: 'Aurora', updatedAt: '2026-09-01T00:00:00.000Z' }),
      project({ id: 'p-3', name: 'Meridian', updatedAt: '2026-08-20T00:00:00.000Z' }),
    ]);
    render(await ProjectsPage(props()));
    const names = () => screen.getAllByRole('link', { name: /Nocturne|Aurora|Meridian/ }).map((l) => l.textContent);

    expect(names()).toEqual(['Aurora', 'Meridian', 'Nocturne']);
    await userEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(names()).toEqual(['Aurora', 'Meridian', 'Nocturne']);
    await userEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(names()).toEqual(['Nocturne', 'Meridian', 'Aurora']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'meri');
    expect(names()).toEqual(['Meridian']);

    await userEvent.click(screen.getByRole('link', { name: 'Meridian' }).closest('tr')!.querySelectorAll('td')[1]!);
    expect(nav.router.push).toHaveBeenCalledWith('/projects/p-3');
    await userEvent.click(screen.getByTestId('archive-p-3'));
    expect(nav.router.push).toHaveBeenCalledTimes(1);
  });
});
