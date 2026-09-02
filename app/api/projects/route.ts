import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createProject,
  listProjects,
  projectDocumentCount,
  projectItemCount,
  ProjectItemInputSchema,
} from '@/lib/projects';
import { currentOrgId, currentSession } from '@/lib/session';
import { runIntakeTurn } from '@/lib/intake/turn';

// Validate the optional seed items the same way the add-items route does — the
// create-with-items path is a second writer of untrusted snapshots.
const CreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  items: z.array(ProjectItemInputSchema).max(100).optional(),
  /** The production in the user's words. Runs the first intake turn on create. */
  description: z.string().trim().max(4000).optional(),
});

/**
 * The signed-in org's projects with their folders — used by the "save to a
 * folder" picker on the browse/cart flow and the FUT-3 extension. Items are
 * saved into a scene folder; the paperwork folder is listed so a picker can
 * show it greyed out, never as a target.
 */
export async function GET() {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const projects = await listProjects(orgId);
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      itemCount: projectItemCount(p),
      documentCount: projectDocumentCount(p),
      folders: p.folders.map((f) => ({
        id: f.id,
        name: f.name,
        kind: f.kind,
        itemCount: f.items.length,
        documentCount: f.documents.length,
      })),
    })),
  });
}

/**
 * Create a project. It starts with a "Scene 1" folder (seeded with `items`, if
 * any) and a "Paperwork" folder. A `description` also runs the first intake
 * turn, so the paperwork checklist exists by the time the user lands on it.
 */
export async function POST(req: Request) {
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Ownership comes from the session, never the body — accepting an org id from a
  // client would let a caller file a project against someone else's organization.
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { orgId } = session;

  const project = await createProject(orgId, parsed.data.name, parsed.data.items ?? []);

  const description = parsed.data.description;
  let intake = false;
  if (description) {
    try {
      intake = (await runIntakeTurn(orgId, project.id, description, session.plan, { userId: session.userId })) !== null;
    } catch (err) {
      // The project exists; the user can describe it again on the paperwork page.
      console.warn(`[intake] first turn for project ${project.id} failed: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    id: project.id,
    folders: project.folders.map((f) => ({ id: f.id, name: f.name, kind: f.kind })),
    intake,
  });
}
