import { describe, expect, it, vi } from 'vitest';

/**
 * Row → object mapping for the project aggregate: the sort orders the UI
 * relies on (paperwork last, newest first) and the null/absent conventions.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { PROJECT_SELECT, db, toProject, toProjectFolder, type ProjectFolderRow, type ProjectRow } from './projects-db';

function folderRow(over: Partial<ProjectFolderRow> = {}): ProjectFolderRow {
  return {
    id: 'f1',
    project_id: 'p1',
    name: 'Scene 1',
    kind: 'scene',
    position: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    project_items: null,
    project_documents: null,
    ...over,
  };
}

function projectRow(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p1',
    org_id: 'o1',
    name: 'Nocturne',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    archived_at: null,
    project_folders: null,
    ...over,
  };
}

describe('toProjectFolder', () => {
  it('maps a bare folder with empty collections', () => {
    expect(toProjectFolder(folderRow())).toEqual({
      id: 'f1',
      projectId: 'p1',
      name: 'Scene 1',
      kind: 'scene',
      position: 0,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      items: [],
      documents: [],
    });
  });

  it('maps items newest first, dropping null image/category and empty metadata', () => {
    const f = toProjectFolder(
      folderRow({
        project_items: [
          { item_id: 'old', source: 'omega', source_id: '1', name: 'Old', image: null, source_url: 'https://a/1', category: null, metadata: {}, added_at: '2026-09-01T00:00:00Z' },
          { item_id: 'new', source: 'clip', source_id: 'https://r/x', name: 'New', image: 'https://a/i.jpg', source_url: 'https://r/x', category: 'seating', metadata: { retailer: 'R' }, added_at: '2026-09-03T00:00:00Z' },
          { item_id: 'mid', source: 'hpr', source_id: '2', name: 'Mid', image: null, source_url: 'https://a/2', category: null, metadata: null, added_at: '2026-09-02T00:00:00Z' },
        ],
      }),
    );
    expect(f.items.map((i) => i.itemId)).toEqual(['new', 'mid', 'old']);
    expect(f.items[2]).toEqual({ itemId: 'old', source: 'omega', sourceId: '1', name: 'Old', sourceUrl: 'https://a/1', addedAt: '2026-09-01T00:00:00Z' });
    expect(f.items[0]).toMatchObject({ image: 'https://a/i.jpg', category: 'seating', meta: { retailer: 'R' } });
    expect(f.items[1]).not.toHaveProperty('meta');
  });

  it('maps documents newest first and coerces bigint sizes', () => {
    const f = toProjectFolder(
      folderRow({
        kind: 'paperwork',
        project_documents: [
          { id: 'd1', folder_id: 'f1', name: 'coi.pdf', storage_path: 'o1/p1/d1.pdf', mime: 'application/pdf', size_bytes: '2048', uploaded_at: '2026-09-01T00:00:00Z' },
          { id: 'd2', folder_id: 'f1', name: 'w9.pdf', storage_path: 'o1/p1/d2.pdf', mime: 'application/pdf', size_bytes: 10, uploaded_at: '2026-09-02T00:00:00Z' },
        ],
      }),
    );
    expect(f.documents.map((d) => d.id)).toEqual(['d2', 'd1']);
    expect(f.documents[1]).toEqual({
      id: 'd1',
      folderId: 'f1',
      name: 'coi.pdf',
      storagePath: 'o1/p1/d1.pdf',
      mime: 'application/pdf',
      sizeBytes: 2048,
      uploadedAt: '2026-09-01T00:00:00Z',
    });
  });
});

describe('toProject', () => {
  it('maps the project and omits archivedAt when null', () => {
    const p = toProject(projectRow());
    expect(p).toEqual({ id: 'p1', orgId: 'o1', name: 'Nocturne', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', folders: [] });
    expect(toProject(projectRow({ archived_at: '2026-09-05T00:00:00Z' })).archivedAt).toBe('2026-09-05T00:00:00Z');
  });

  it('orders scene folders by position then createdAt, with paperwork last', () => {
    const p = toProject(
      projectRow({
        project_folders: [
          folderRow({ id: 'paper', kind: 'paperwork', position: 0, created_at: '2026-01-01T00:00:00Z' }),
          folderRow({ id: 's2', position: 2 }),
          folderRow({ id: 's1b', position: 1, created_at: '2026-09-02T00:00:00Z' }),
          folderRow({ id: 's1a', position: 1, created_at: '2026-09-01T00:00:00Z' }),
          folderRow({ id: 's0', position: 0 }),
        ],
      }),
    );
    expect(p.folders.map((f) => f.id)).toEqual(['s0', 's1a', 's1b', 's2', 'paper']);
  });
});

describe('db', () => {
  it('hands back the service-role client', () => {
    expect(typeof db().from).toBe('function');
  });

  it('selects the whole aggregate in one shape', () => {
    expect(PROJECT_SELECT).toBe('*, project_folders(*, project_items(*), project_documents(*))');
  });
});
