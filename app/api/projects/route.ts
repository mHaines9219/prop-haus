import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createProject, listProjects, ProjectItemInputSchema } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

// Validate the optional seed items the same way the add-items route does — the
// create-with-items path is a second writer of untrusted snapshots.
const CreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  items: z.array(ProjectItemInputSchema).max(100).optional(),
});

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
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Ownership comes from the session, never the body — accepting an org id from a
  // client would let a caller file a folder against someone else's organization.
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await createProject(orgId, parsed.data.name, parsed.data.items ?? []);
  return NextResponse.json({ id: project.id });
}
