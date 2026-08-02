import { NextResponse } from 'next/server';
import { createProject, type CreateProjectInput } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

export async function POST(req: Request) {
  const body = (await req.json()) as CreateProjectInput;
  if (!body.lines?.length) {
    return NextResponse.json({ error: 'no lines' }, { status: 400 });
  }
  if (body.endDate < body.startDate) {
    // Mirrors the projects_dates_ordered check constraint, so the request fails
    // here with a 400 rather than at the database with a 500 after the port.
    return NextResponse.json({ error: 'end date is before start date' }, { status: 400 });
  }
  // Ownership comes from the session, never the body — accepting an org id from a
  // client would let a caller file a project against someone else's organization.
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await createProject(orgId, body);
  return NextResponse.json({ id: project.id });
}
