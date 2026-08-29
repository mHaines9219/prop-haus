import { NextResponse } from 'next/server';
import { addItemsToProject, removeItemFromProject, type ProjectItemInput } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { items?: ProjectItemInput[] };
  if (!body.items?.length) {
    return NextResponse.json({ error: 'no items' }, { status: 400 });
  }

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const project = await addItemsToProject(orgId, id, body.items);
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
