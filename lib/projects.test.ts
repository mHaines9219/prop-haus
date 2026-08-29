import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addItemsToProject,
  createProject,
  getProject,
  listProjects,
  removeItemFromProject,
  setProjectArchived,
  type ProjectItemInput,
} from './projects';

/**
 * ORG SCOPING is an access boundary, tested as an INTEGRATION test against the
 * real database: `lib/projects.ts` uses the service-role client, which bypasses
 * RLS, so the `org_id` filters in its queries ARE the access control and a mock
 * would happily agree with a broken one.
 *
 * Creates two throwaway organizations and deletes them afterwards; project_items
 * cascades from projects. Skips when Supabase credentials are absent, so the
 * suite stays green without them rather than failing for the wrong reason.
 */

const HAS_DB = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const item = (itemId: string): ProjectItemInput => ({
  itemId,
  source: 'gilandroy',
  sourceId: itemId,
  name: 'Chair',
  sourceUrl: 'https://example.com/chair',
});

describe.skipIf(!HAS_DB)('organization scoping (integration)', () => {
  const ORG_A = crypto.randomUUID();
  const ORG_B = crypto.randomUUID();

  async function admin() {
    const { createAdminClient } = await import('./supabase/admin');
    return createAdminClient();
  }

  beforeAll(async () => {
    const c = await admin();
    const { error } = await c.from('organizations').insert([
      { id: ORG_A, type: 'company', name: 'test org A', plan: 'free' },
      { id: ORG_B, type: 'company', name: 'test org B', plan: 'free' },
    ]);
    if (error) throw new Error(`seed orgs: ${error.message}`);
  });

  afterAll(async () => {
    // Cascades through projects -> project_items.
    const c = await admin();
    await c.from('organizations').delete().in('id', [ORG_A, ORG_B]);
  });

  it('stamps the owning org and a 16-byte id, with items intact', async () => {
    const p = await createProject(ORG_A, 'stamp', [item('i1')]);
    expect(p.orgId).toBe(ORG_A);
    expect(p.id).toHaveLength(32);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].itemId).toBe('i1');
  });

  it('never returns another org’s folders', async () => {
    await createProject(ORG_A, 'folder a');
    await createProject(ORG_B, 'folder b');

    const a = await listProjects(ORG_A);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((p) => p.orgId === ORG_A)).toBe(true);
    expect(await listProjects(crypto.randomUUID())).toHaveLength(0);
  });

  it('hides archived folders unless asked for them', async () => {
    const p = await createProject(ORG_A, 'archivable');
    const before = (await listProjects(ORG_A)).length;

    expect(await setProjectArchived(ORG_A, p.id, true)).not.toBeNull();
    expect((await listProjects(ORG_A)).length).toBe(before - 1);
    expect((await listProjects(ORG_A, { includeArchived: true })).length).toBe(before);

    expect(await setProjectArchived(ORG_A, p.id, false)).not.toBeNull();
    expect((await listProjects(ORG_A)).length).toBe(before);
  });

  it('refuses to archive a folder belonging to another org', async () => {
    const p = await createProject(ORG_A, 'not yours');
    // Reported as not-found rather than forbidden, so this cannot be used to
    // probe which project ids exist.
    expect(await setProjectArchived(ORG_B, p.id, true)).toBeNull();
    expect((await listProjects(ORG_A)).some((x) => x.id === p.id)).toBe(true);
  });

  it('returns null for an unknown id', async () => {
    expect(await setProjectArchived(ORG_A, 'nope', true)).toBeNull();
  });

  it('hides another org’s folder from getProject', async () => {
    const p = await createProject(ORG_A, 'scoped read');
    expect(await getProject(ORG_B, p.id)).toBeUndefined();
    expect(await getProject(ORG_A, p.id)).toBeDefined();
  });

  it('refuses to add items to another org’s folder, and does not alter it', async () => {
    const p = await createProject(ORG_A, 'protected');
    expect(await addItemsToProject(ORG_B, p.id, [item('i2')])).toBeNull();
    expect((await getProject(ORG_A, p.id))?.items).toHaveLength(0);

    expect(await addItemsToProject(ORG_A, p.id, [item('i2')])).not.toBeNull();
    expect((await getProject(ORG_A, p.id))?.items).toHaveLength(1);
  });

  it('is idempotent when saving the same item twice', async () => {
    const p = await createProject(ORG_A, 'dedup', [item('i3')]);
    expect(await addItemsToProject(ORG_A, p.id, [item('i3')])).not.toBeNull();
    expect((await getProject(ORG_A, p.id))?.items).toHaveLength(1);
  });

  it('refuses to remove items from another org’s folder', async () => {
    const p = await createProject(ORG_A, 'remove-protected', [item('i4')]);
    expect(await removeItemFromProject(ORG_B, p.id, 'i4')).toBeNull();
    expect((await getProject(ORG_A, p.id))?.items).toHaveLength(1);

    expect(await removeItemFromProject(ORG_A, p.id, 'i4')).not.toBeNull();
    expect((await getProject(ORG_A, p.id))?.items).toHaveLength(0);
  });
});
