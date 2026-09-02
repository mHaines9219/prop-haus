/**
 * Reads and writes for a project's profile (projects.profile). Server only.
 * The pure half is project-profile.ts. Org-scoped: a write for a project the
 * org does not own touches nothing and returns false.
 */

import { createAdminClient } from './supabase/admin';
import { normalizeProjectProfile, type ProjectProfile } from './project-profile';

export async function getProjectProfile(orgId: string, projectId: string): Promise<ProjectProfile | null> {
  const { data, error } = await createAdminClient()
    .from('projects')
    .select('profile')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`getProjectProfile: ${error.message}`);
  return data ? normalizeProjectProfile((data as { profile: unknown }).profile) : null;
}

export async function updateProjectProfile(orgId: string, projectId: string, profile: ProjectProfile): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('projects')
    .update({ profile, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('org_id', orgId)
    .select('id');
  if (error) throw new Error(`updateProjectProfile: ${error.message}`);
  return (data ?? []).length > 0;
}
