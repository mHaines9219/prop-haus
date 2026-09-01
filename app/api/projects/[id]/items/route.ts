import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addItemsToProject, removeItemFromProject, ProjectItemInputSchema } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

// Bound the batch and validate every snapshot: this route now accepts web clips
// (MVP-7), which turn arbitrary retailer HTML into these — untrusted input.
const ItemsBody = z.object({ items: z.array(ProjectItemInputSchema).min(1).max(100) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = ItemsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid items' }, { status: 400 });
  }

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await addItemsToProject(orgId, id, parsed.data.items);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, itemCount: project.items.length });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = new URL(req.url).searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await removeItemFromProject(orgId, id, itemId);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, itemCount: project.items.length });
}
