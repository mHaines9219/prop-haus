import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addItemsToFolder,
  addItemsToProject,
  projectItemCount,
  removeItemFromFolder,
  removeItemFromProject,
  ProjectItemInputSchema,
} from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

/**
 * Project-level item routes, kept for callers that predate folders (the FUT-3
 * extension contract points here). An optional `folderId` targets a specific
 * scene folder; without one, items land in the project's first scene folder
 * and removal clears the item from every scene folder.
 *
 * The per-folder routes live at /api/projects/[id]/folders/[folderId]/items.
 */

// Bound the batch and validate every snapshot: this route accepts web clips
// (MVP-7), which turn arbitrary retailer HTML into these — untrusted input.
const ItemsBody = z.object({
  items: z.array(ProjectItemInputSchema).min(1).max(100),
  folderId: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = ItemsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid items' }, { status: 400 });
  }

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { items, folderId } = parsed.data;
  const project = folderId
    ? await addItemsToFolder(orgId, id, folderId, items)
    : await addItemsToProject(orgId, id, items);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, itemCount: projectItemCount(project) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const itemId = url.searchParams.get('itemId');
  const folderId = url.searchParams.get('folderId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = folderId
    ? await removeItemFromFolder(orgId, id, folderId, itemId)
    : await removeItemFromProject(orgId, id, itemId);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, itemCount: projectItemCount(project) });
}
