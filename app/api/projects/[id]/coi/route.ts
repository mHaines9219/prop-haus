import { NextResponse } from 'next/server';
import { setCoiStatus, type CoiStatus } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';
import type { Source } from '@/lib/types';

/**
 * Move a vendor's COI along its workflow.
 *
 * Same omission as the approve route: no session was read, so anyone with a
 * project id could mark a vendor's insurance approved or attach a certificate
 * URL of their choosing. Compliance state that an outsider can write is worse
 * than no compliance state, because the record looks authoritative.
 *
 * Both callers of this endpoint are owner-side UI — `app/projects/[id]`'s COI
 * panel and nothing else. The vendor portal at `/vendor/[token]` does not touch
 * COI, so requiring an owner session takes nothing away from vendors.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { vendor: Source; status: CoiStatus; certUrl?: string };

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const p = await setCoiStatus(orgId, id, body.vendor, body.status, body.certUrl);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
