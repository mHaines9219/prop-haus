import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createFolder, FolderNameSchema } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

const CreateBody = z.object({ name: FolderNameSchema });

/** Add a scene folder to a project. The paperwork folder is created with the project and can't be added here. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  // Scoped to the caller's org inside createFolder — another org's project reads
  // as 404, not 403, so this can't be used to probe which project ids exist.
  const folder = await createFolder(orgId, id, parsed.data.name);
  if (!folder) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ id: folder.id, name: folder.name, kind: folder.kind });
}
