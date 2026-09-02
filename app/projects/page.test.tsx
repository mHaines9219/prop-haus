// /projects dashboard: session gate, archived toggle, empty states, and one row per production.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    const row = screen.getByRole('link', { name: /Nocturne/ });
    expect(row).toHaveAttribute('href', '/projects/p-1');
    expect(row).toHaveTextContent('2 scenes · 3 items · 1 document');
    expect(within(row).getAllByRole('img')).toHaveLength(2);
    expect(screen.getByTestId('archive-p-1')).toHaveTextContent('Archive');

    const archived = screen.getByRole('link', { name: /Archived Short/ });
    expect(archived).toHaveTextContent('1 scene · 0 items · 0 documents');
    expect(within(archived).queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByTestId('archive-p-2')).toHaveTextContent('Restore');
    expect(screen.getAllByText(/Sep \d+$/)).toHaveLength(2);
  });
});
