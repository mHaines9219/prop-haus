import { NextResponse } from 'next/server';
import { createProject, listProjects, type ProjectItemInput } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

type CreateBody = { name?: string; items?: ProjectItemInput[] };

/** The signed-in org's folders — used by the "save to a folder" picker on the browse/cart flow. */
export async function GET() {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const projects = await listProjects(orgId);
  return NextResponse.json({
    projects: projects.map((p) => ({ id: p.id, name: p.name, itemCount: p.items.length })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreateBody;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  // Ownership comes from the session, never the body — accepting an org id from a
  // client would let a caller file a folder against someone else's organization.
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await createProject(orgId, name, body.items ?? []);
  return NextResponse.json({ id: project.id });
}
