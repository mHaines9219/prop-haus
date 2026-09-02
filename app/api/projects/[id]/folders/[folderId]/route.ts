import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteFolder, renameFolder, FolderNameSchema } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

type Params = { params: Promise<{ id: string; folderId: string }> };

const PatchBody = z.object({ name: FolderNameSchema });

/** Rename a folder. */
export async function PATCH(req: Request, { params }: Params) {
  const { id, folderId } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await renameFolder(orgId, id, folderId, parsed.data.name);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Delete a scene folder and everything saved in it. The paperwork folder can't be deleted. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, folderId } = await params;

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const result = await deleteFolder(orgId, id, folderId);
  if (result === 'not-found') return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (result === 'paperwork') {
    return NextResponse.json({ error: 'the paperwork folder cannot be deleted' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
