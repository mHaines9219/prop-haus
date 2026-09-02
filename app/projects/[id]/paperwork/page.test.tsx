// /projects/[id]/paperwork: session gate, not-found, and the workspace with its two halves.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut } from '@/test/mocks/session';
import { evaluate } from '@/lib/requirements/evaluate';
import type { Project } from '@/lib/projects';
import PaperworkPage from './page';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/components/ap/site-nav', () => ({ SiteNav: () => <header data-testid="site-nav" /> }));
vi.mock('@/lib/requirements/store', () => ({ buildChecklist: vi.fn() }));
vi.mock('@/lib/intake/store', () => ({ listIntakeMessages: vi.fn(async () => []) }));

const store = vi.mocked(await import('@/lib/requirements/store'));

function project(profile: Project['profile'] = {}): Project {
  return {
    id: 'p-1',
    orgId: 'org',
    name: 'Nocturne',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    profile,
    folders: [],
  };
}

const page = () => PaperworkPage({ params: Promise.resolve({ id: 'p-1' }) });

beforeEach(() => {
  signIn();
  store.buildChecklist.mockReset();
  process.env.INTAKE_PROVIDER = 'mock';
});

describe('PaperworkPage', () => {
  it('redirects a signed-out visitor to login with the return path', async () => {
    signOut();
    await expect(page()).rejects.toThrow('/login?next=%2Fprojects%2Fp-1%2Fpaperwork');
  });

  it('404s when the project is not the caller’s', async () => {
    store.buildChecklist.mockResolvedValue(null);
    await expect(page()).rejects.toThrow(/NEXT_NOT_FOUND|404/);
  });

  it('renders the summary, the intake panel, and the checklist', async () => {
    const profile = { productionType: 'film' as const, crew: { count: 12 }, cast: { minors: true } };
    const checklist = evaluate({ profile, states: [{ requirementId: 'crew_deal_memo', status: 'attached', document: { id: 'd1', name: 'memos.pdf' } }] });
    store.buildChecklist.mockResolvedValue({ project: project(profile), checklist });

    render(await page());
    expect(screen.getByRole('heading', { level: 1, name: 'Nocturne' })).toBeInTheDocument();
    expect(screen.getByText(`1 of ${checklist.summary.total} complete`)).toBeInTheDocument();
    expect(screen.getByText('Tell us about the production')).toBeInTheDocument();
    expect(screen.getByText('Paperwork checklist')).toBeInTheDocument();
    expect(screen.getByText('Minor release with parent or guardian consent')).toBeInTheDocument();
    expect(screen.getByText('Film')).toBeInTheDocument();
    expect(screen.getByText('Still open')).toBeInTheDocument();
    expect(store.buildChecklist).toHaveBeenCalledWith(expect.any(String), 'p-1', 'free');
  });

  it('says so when nothing has been described', async () => {
    store.buildChecklist.mockResolvedValue({ project: project(), checklist: evaluate({ profile: {} }) });
    render(await page());
    expect(screen.getByText('No checklist yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing to list yet')).toBeInTheDocument();
  });
});
