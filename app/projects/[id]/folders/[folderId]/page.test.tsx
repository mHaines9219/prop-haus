// /projects/[id]/folders/[folderId]: scene vs paperwork rendering, clip vs catalog items, documents.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut, ORG_ID } from '@/test/mocks/session';
import type { Project, ProjectDocument, ProjectFolder, ProjectItem } from '@/lib/projects';
import FolderPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('./remove-item-button', () => ({
  RemoveItemButton: ({ itemId }: { itemId: string }) => <button data-testid={`remove-item-${itemId}`}>Remove</button>,
}));
vi.mock('./remove-document-button', () => ({
  RemoveDocumentButton: ({ documentId }: { documentId: string }) => (
    <button data-testid={`remove-doc-${documentId}`}>Remove</button>
  ),
}));
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
    sizeBytes: 1_258_291,
    uploadedAt: '2026-09-01T12:00:00.000Z',
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

/** The thumb and the title are two links with the same accessible name; the title is last. */
function titleLink(name: string) {
  const all = screen.getAllByRole('link', { name });
  expect(all.length).toBe(2);
  return all[all.length - 1]!;
}

function props(id = 'p-1', folderId = 'f-1') {
  return { params: Promise.resolve({ id, folderId }) };
}

beforeEach(() => {
  projects.getProject.mockReset();
});

describe('FolderPage', () => {
  it('redirects a signed-out visitor to /login carrying the folder path', async () => {
    signOut();
    await expect(FolderPage(props('p-7', 'f-9'))).rejects.toThrow('/login?next=%2Fprojects%2Fp-7%2Ffolders%2Ff-9');
    expect(projects.getProject).not.toHaveBeenCalled();
  });

  it('404s when the project is missing or the folder is not in it', async () => {
    signIn();
    projects.getProject.mockResolvedValue(undefined);
    await expect(FolderPage(props())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(projects.getProject).toHaveBeenCalledWith(ORG_ID, 'p-1');

    projects.getProject.mockResolvedValue(project());
    await expect(FolderPage(props('p-1', 'nope'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders a scene folder with catalog items, clips and an unsafe clip', async () => {
    signIn();
    projects.getProject.mockResolvedValue(
      project({
        folders: [
          folder({
            items: [
              item({ itemId: 'omega-a b', sourceId: 'a b', name: 'Credenza' }),
              item({
                itemId: 'clip-1',
                source: 'clip',
                sourceId: 'https://www.cb2.com/lamp',
                sourceUrl: 'https://www.cb2.com/lamp',
                name: 'CB2 lamp',
                meta: { retailer: 'CB2' },
              }),
              item({
                itemId: 'clip-2',
                source: 'clip',
                sourceId: 'https://www.westelm.com/sofa',
                sourceUrl: 'https://www.westelm.com/sofa',
                name: 'West Elm sofa',
              }),
              item({
                itemId: 'clip-3',
                source: 'clip',
                sourceId: 'javascript:alert(1)',
                sourceUrl: 'javascript:alert(1)',
                name: 'Bad clip',
              }),
            ],
          }),
          folder({ id: 'f-pw', name: 'Paperwork', kind: 'paperwork', position: 1 }),
        ],
      }),
    );
    render(await FolderPage(props()));

    expect(screen.getByRole('link', { name: 'Nocturne' })).toHaveAttribute('href', '/projects/p-1');
    expect(screen.getByText('Scene')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Scene 1');
    expect(screen.getByText('4 items')).toBeInTheDocument();

    const credenza = titleLink('Credenza');
    expect(credenza).toHaveAttribute('href', '/item/omega/a%20b');
    const credenzaRow = credenza.closest('.min-h-\\[88px\\]')!;
    expect(credenzaRow).toHaveTextContent('Omega Cinema Props');
    expect(credenzaRow).not.toHaveTextContent('Web clip');
    expect(within(credenzaRow as HTMLElement).getByRole('link', { name: /Vendor/ })).toHaveAttribute(
      'href',
      'https://omegacinemaprops.com/item/1',
    );

    const lamp = titleLink('CB2 lamp');
    expect(lamp).toHaveAttribute('href', 'https://www.cb2.com/lamp');
    expect(lamp).toHaveAttribute('target', '_blank');
    const lampRow = lamp.closest('.min-h-\\[88px\\]')!;
    expect(lampRow).toHaveTextContent('CB2 · Web clip');
    expect(within(lampRow as HTMLElement).getByRole('link', { name: /Retailer/ })).toBeInTheDocument();

    expect(titleLink('West Elm sofa').closest('.min-h-\\[88px\\]')).toHaveTextContent(
      'westelm.com · Web clip',
    );

    expect(screen.queryAllByRole('link', { name: 'Bad clip' })).toHaveLength(0);
    const badRow = screen.getByText('Bad clip').closest('.min-h-\\[88px\\]')!;
    expect(within(badRow as HTMLElement).queryAllByRole('link')).toHaveLength(0);
    expect(badRow).toHaveTextContent('Web clip');
    expect(badRow).not.toHaveTextContent('javascript');

    expect(screen.getByTestId('remove-item-omega-a b')).toBeInTheDocument();
    expect(screen.getByTestId('remove-item-clip-3')).toBeInTheDocument();
    expect(screen.queryByText('Nothing pulled for this scene yet')).not.toBeInTheDocument();
  });

  it('shows the empty scene state with the clipper', async () => {
    signIn();
    projects.getProject.mockResolvedValue(project());
    render(await FolderPage(props()));
    expect(screen.getByText('0 items')).toBeInTheDocument();
    expect(screen.getByText('Nothing pulled for this scene yet')).toBeInTheDocument();
  });

  it('renders the paperwork folder with typed, sized document rows', async () => {
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
            documents: [
              doc(),
              doc({ id: 'd-2', name: 'call-sheet.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 512 }),
              doc({ id: 'd-3', name: 'mystery.bin', mime: 'application/octet-stream', sizeBytes: 20 * 1024 }),
            ],
          }),
        ],
      }),
    );
    render(await FolderPage(props('p-1', 'f-pw')));

    expect(screen.getByText('Paperwork', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Paperwork');
    expect(screen.getByText('3 documents')).toBeInTheDocument();

    const coi = screen.getByRole('link', { name: 'coi.pdf' });
    expect(coi).toHaveAttribute('href', '/api/projects/p-1/documents/d-1');
    expect(coi).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Open coi.pdf' })).toHaveAttribute('href', '/api/projects/p-1/documents/d-1');
    expect(coi.parentElement).toHaveTextContent(/PDF · 1\.2 MB · Sep \d+, 2026/);
    expect(screen.getByRole('link', { name: 'call-sheet.docx' }).parentElement).toHaveTextContent('DOCX · 512 B');
    expect(screen.getByRole('link', { name: 'mystery.bin' }).parentElement).toHaveTextContent('FILE · 20 KB');
    expect(screen.getAllByRole('link', { name: /Download/ })).toHaveLength(3);
    expect(screen.getByTestId('remove-doc-d-3')).toBeInTheDocument();
  });

  it('shows the empty paperwork state with the uploader', async () => {
    signIn();
    projects.getProject.mockResolvedValue(project());
    render(await FolderPage(props('p-1', 'f-pw')));
    expect(screen.getByText('0 documents')).toBeInTheDocument();
    expect(screen.getByText('No paperwork yet')).toBeInTheDocument();
    expect(screen.queryByText('Nothing pulled for this scene yet')).not.toBeInTheDocument();
  });
});
