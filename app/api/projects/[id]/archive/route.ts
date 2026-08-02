import { NextResponse } from 'next/server';
import { setProjectArchived } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { archived?: boolean };
  // Scoped to the caller's org inside setProjectArchived — a project belonging to
  // another org returns null here and is reported as 404, not 403, so this endpoint
  // cannot be used to probe which project ids exist.
  const p = await setProjectArchived(await currentOrgId(), id, body.archived === true);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, archivedAt: p.archivedAt ?? null });
}
