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
  // Ownership is taken from the session, not the body — see lib/session.ts.
  const project = await createProject(await currentOrgId(), body);
  return NextResponse.json({ id: project.id });
}
