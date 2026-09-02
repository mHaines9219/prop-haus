import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runIntakeTurn } from '@/lib/intake/turn';
import { currentSession } from '@/lib/session';

type Params = { params: Promise<{ id: string }> };

const Body = z.object({ message: z.string().trim().min(1).max(4000) });

/**
 * One intake turn: the user's message about the production. The profile is
 * updated, the reply and next questions come back with the re-evaluated
 * checklist. 404 for a project that is not the caller's.
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'message is required' }, { status: 400 });

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const turn = await runIntakeTurn(session.orgId, id, parsed.data.message, session.plan, { userId: session.userId });
  if (!turn) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(turn);
}
