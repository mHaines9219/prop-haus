import { NextResponse } from 'next/server';
import { mergeProjectProfile, normalizeProjectProfile, profileFacts, profileGaps } from '@/lib/project-profile';
import { getProjectProfile, updateProjectProfile } from '@/lib/project-profile-store';
import { buildChecklist } from '@/lib/requirements/store';
import { currentSession } from '@/lib/session';

type Params = { params: Promise<{ id: string }> };

/**
 * Direct edits to the project profile, for facts the user would rather type
 * than say. The body is a profile patch (lib/project-profile.ts shape);
 * unknown keys are dropped, and the checklist comes back re-evaluated.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'a profile patch is required' }, { status: 400 });
  }

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const current = await getProjectProfile(session.orgId, id);
  if (current === null) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const profile = mergeProjectProfile(current, normalizeProjectProfile(body));
  await updateProjectProfile(session.orgId, id, profile);

  const built = await buildChecklist(session.orgId, id, session.plan);
  if (!built) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    profile,
    facts: profileFacts(profile),
    questions: profileGaps(profile).slice(0, 3),
    checklist: built.checklist,
  });
}
