// /projects/[id]: session gate, not-found, scene rows, and the paperwork row's two copy states.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import type { Project, ProjectDocument, ProjectFolder, ProjectItem } from '@/lib/projects';
import ProjectPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/projects', async () => ({
  ...(await vi.importActual<typeof import('@/lib/projects')>('@/lib/projects')),
  getProject: vi.fn(),
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
});

describe('ProjectPage', () => {
  it('redirects a signed-out visitor to /login carrying the project path', async () => {
    signOut();
    await expect(ProjectPage(props('p-7'))).rejects.toThrow('/login?next=%2Fprojects%2Fp-7');
    expect(projects.getProject).not.toHaveBeenCalled();
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

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nocturne');
    expect(screen.getByText('2 scenes · 2 items · 0 documents')).toBeInTheDocument();

    const scene1 = screen.getByRole('link', { name: /Scene 1/ });
    expect(scene1).toHaveAttribute('href', '/projects/p-1/folders/f-1');
    expect(scene1).toHaveTextContent('2 items');
    expect(within(scene1).getAllByRole('img')).toHaveLength(1);

    const kitchen = screen.getByRole('link', { name: /Kitchen/ });
    expect(kitchen).toHaveAttribute('href', '/projects/p-1/folders/f-2');
    expect(kitchen).toHaveTextContent('0 items');
    expect(screen.queryByText('No scenes yet')).not.toBeInTheDocument();

    const paperwork = screen.getByRole('link', { name: /Paperwork/ });
    expect(paperwork).toHaveAttribute('href', '/projects/p-1/folders/f-pw');
    expect(paperwork).toHaveTextContent('COIs, W9s, invoices, call sheets');
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
    expect(screen.getByRole('link', { name: /Paperwork/ })).toHaveTextContent('2 documents');
  });

  it('shows the empty scenes state and omits the paperwork section without that folder', async () => {
    signIn();
    projects.getProject.mockResolvedValue(project({ folders: [] }));
    render(await ProjectPage(props()));
    expect(screen.getByText('No scenes yet')).toBeInTheDocument();
    expect(screen.getByText('0 scenes · 0 items · 0 documents')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Paperwork' })).not.toBeInTheDocument();
  });
});
