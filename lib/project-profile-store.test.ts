import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/test/mocks/supabase-admin';
import { getProjectProfile, updateProjectProfile } from './project-profile-store';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

beforeEach(() => {
  db.reset();
  db.seed('projects', [
    { id: 'p1', org_id: 'org-a', profile: { productionType: 'film', crew: { count: 12 }, junk: 'dropped', schedule: { start: 'not a date' } } },
    { id: 'p2', org_id: 'org-a', profile: null },
  ]);
});

describe('getProjectProfile', () => {
  it('returns the stored profile, normalized', async () => {
    expect(await getProjectProfile('org-a', 'p1')).toEqual({ productionType: 'film', crew: { count: 12 } });
  });

  it('reads an empty profile column as an empty profile', async () => {
    expect(await getProjectProfile('org-a', 'p2')).toEqual({});
  });

  it('returns null for a project the org does not own, or one that does not exist', async () => {
    expect(await getProjectProfile('org-b', 'p1')).toBeNull();
    expect(await getProjectProfile('org-a', 'nope')).toBeNull();
  });

  it('throws when the read fails', async () => {
    db.failNext('projects', 'select', 'connection reset');
    await expect(getProjectProfile('org-a', 'p1')).rejects.toThrow('getProjectProfile: connection reset');
  });
});

describe('updateProjectProfile', () => {
  it('writes the profile and stamps updated_at for the owning org', async () => {
    const before = Date.now();
    expect(await updateProjectProfile('org-a', 'p1', { productionType: 'commercial' })).toBe(true);
    const row = db.rows('projects').find((r) => r.id === 'p1')!;
    expect(row.profile).toEqual({ productionType: 'commercial' });
    expect(Date.parse(row.updated_at as string)).toBeGreaterThanOrEqual(before);
    expect(await getProjectProfile('org-a', 'p1')).toEqual({ productionType: 'commercial' });
  });

  it('touches nothing and returns false for another org', async () => {
    expect(await updateProjectProfile('org-b', 'p1', { productionType: 'commercial' })).toBe(false);
    expect(db.rows('projects').find((r) => r.id === 'p1')!.profile).toMatchObject({ productionType: 'film' });
  });

  it('throws when the write fails', async () => {
    db.failNext('projects', 'update', 'permission denied');
    await expect(updateProjectProfile('org-a', 'p1', {})).rejects.toThrow('updateProjectProfile: permission denied');
  });
});
