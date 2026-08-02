import { NextResponse } from 'next/server';
import { approveProject } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

/**
 * Approving a proposal commits a production to the quoted spend, so it is an
 * owner action and nothing weaker.
 *
 * This route previously read no session at all: anyone who knew a project id
 * could mark that project confirmed. The id travels in the proposal URL, which
 * is the one URL we intend productions to forward to clients — so the people
 * most likely to hold it were exactly the people who should not have been able
 * to act on it.
 *
 * 401 when signed out, 404 when the project is not the caller's. Not 403: a
 * distinguishable "exists but not yours" would turn this into an oracle for
 * which project ids are real.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const p = await approveProject(orgId, id);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
