import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { findDocumentByPacket, markDocumentSigned } from '@/lib/forms/documents';

/**
 * POST /api/forms/webhook — Anvil calls this when an Etch packet completes.
 *
 * Anvil authenticates webhooks with the `token` it generates when webhooks are
 * enabled on the organization settings page; the same value lives in
 * ANVIL_WEBHOOK_SECRET. No session: this is Anvil, not a user, so the route is
 * excluded from the auth middleware matcher.
 */

type AnvilWebhook = {
  action?: string;
  token?: string;
  data?: { eid?: string; documentGroup?: { eid?: string } };
};

export async function POST(req: Request) {
  const secret = process.env.ANVIL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });

  let body: AnvilWebhook;
  try {
    body = (await req.json()) as AnvilWebhook;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!tokenMatches(body.token, secret)) {
    return NextResponse.json({ error: 'bad token' }, { status: 401 });
  }

  if (body.action !== 'etchPacketComplete') return NextResponse.json({ ok: true, ignored: body.action });

  const packetEid = body.data?.eid;
  if (!packetEid) return NextResponse.json({ error: 'no packet eid' }, { status: 400 });

  const doc = await findDocumentByPacket(packetEid);
  if (!doc) return NextResponse.json({ ok: true, ignored: 'unknown packet' });

  try {
    await markDocumentSigned(doc);
  } catch (err) {
    console.error('[forms/webhook] signed copy not stored', err);
    return NextResponse.json({ error: 'signed copy not stored' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function tokenMatches(token: string | undefined, secret: string): boolean {
  if (typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
