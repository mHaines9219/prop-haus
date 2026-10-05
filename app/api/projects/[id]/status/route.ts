import { NextResponse } from 'next/server';
import { setProjectStatus } from '@/lib/projects';
import { isProjectStatus } from '@/lib/project-status';
import { currentSession } from '@/lib/session';
import { recordEvents } from '@/lib/analytics';

/**
 * PATCH /api/projects/[id]/status — set the user's own Dashboard status on a
 * project. Body: { status: 'active' | 'pending' | 'done' }.
 *
 * Session-checked and org-scoped: the org comes from the session, never the
 * body, and a project belonging to another org reads as 404 (not 403) so this
 * endpoint cannot be used to probe which project ids exist.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: { status?: unknown };
  try {
    body = (await req.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!isProjectStatus(body.status)) {
    return NextResponse.json({ error: `invalid status: ${String(body.status)}` }, { status: 400 });
  }

  const project = await setProjectStatus(session.orgId, id, body.status);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await recordEvents({
    orgId: session.orgId,
    userId: session.userId,
    type: 'project_status_changed',
    payload: { projectId: id, status: body.status },
  });

  return NextResponse.json({ ok: true, status: project.status });
}
