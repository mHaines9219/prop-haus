import { NextResponse } from 'next/server';
import { setProjectShared } from '@/lib/projects';
import { currentOrgId } from '@/lib/session';

/**
 * Mint or revoke the client-facing share link.
 *
 * Owner-only: issuing a credential that exposes a production's budget is an
 * owner action, in the same category as approving the proposal.
 *
 * Minting always rotates. Sharing an already-shared project returns a NEW token
 * and invalidates the previous one — so "revoke" and "reissue" are the same
 * operation from the holder's side, and there is no way to be handed back a
 * link that a previous recipient still has.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { shared?: boolean };

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { ok, shareToken } = await setProjectShared(orgId, id, body.shared === true);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // The owner can re-read the live URL from their own proposal page, which is
  // org-scoped — so copying a link a second time does not force a rotation that
  // would silently break the copy the client is already using.
  return NextResponse.json({
    ok: true,
    shareUrl: shareToken ? `/proposal/${shareToken}` : null,
  });
}
