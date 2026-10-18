import { NextResponse } from 'next/server';
import { setProjectSummary } from '@/lib/projects';
import { PROJECT_SUMMARY_MAX } from '@/lib/project-summary';
import { currentSession } from '@/lib/session';
import { recordEvents } from '@/lib/analytics';

/**
 * PATCH /api/projects/[id]/summary — set the user's free-text job summary on
 * a project. Body: { summary: string } (up to PROJECT_SUMMARY_MAX characters;
 * an empty string clears it).
 *
 * Session-checked and org-scoped: the org comes from the session, never the
 * body, and a project belonging to another org reads as 404 (not 403) so this
 * endpoint cannot be used to probe which project ids exist.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: { summary?: unknown };
  try {
    body = (await req.json()) as { summary?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (typeof body.summary !== 'string') {
    return NextResponse.json({ error: 'summary must be a string' }, { status: 400 });
  }
  const summary = body.summary.trim();
  if (summary.length > PROJECT_SUMMARY_MAX) {
    return NextResponse.json(
      { error: `summary must be ${PROJECT_SUMMARY_MAX} characters or fewer` },
      { status: 400 },
    );
  }

  const project = await setProjectSummary(session.orgId, id, summary);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await recordEvents({
    orgId: session.orgId,
    userId: session.userId,
    type: 'project_summary_changed',
    payload: { projectId: id, length: summary.length },
  });

  return NextResponse.json({ ok: true, summary: project.summary });
}
