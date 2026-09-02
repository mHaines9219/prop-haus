import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addItemsToFolder,
  findFolder,
  removeItemFromFolder,
  ProjectItemInputSchema,
} from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

type Params = { params: Promise<{ id: string; folderId: string }> };

// Bound the batch and validate every snapshot: this route accepts web clips
// (MVP-7), which turn arbitrary retailer HTML into these — untrusted input.
const ItemsBody = z.object({ items: z.array(ProjectItemInputSchema).min(1).max(100) });

/** Save items into a scene folder. Paperwork folders answer 404 — items never live there. */
export async function POST(req: Request, { params }: Params) {
  const { id, folderId } = await params;
  const parsed = ItemsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid items' }, { status: 400 });
  }

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await addItemsToFolder(orgId, id, folderId, parsed.data.items);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, itemCount: findFolder(project, folderId)?.items.length ?? 0 });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id, folderId } = await params;
  const itemId = new URL(req.url).searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await removeItemFromFolder(orgId, id, folderId, itemId);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, itemCount: findFolder(project, folderId)?.items.length ?? 0 });
}
