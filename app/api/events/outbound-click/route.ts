import { NextResponse } from 'next/server';
import { recordEvents } from '@/lib/analytics';
import { currentOrgId } from '@/lib/session';
import { SOURCE_META, type Source } from '@/lib/types';

/**
 * Outbound-click demand beacon — MVP-6 emulate #1.
 *
 * When a user clicks through to a vendor's own listing ("View on <vendor>"),
 * the client fires `navigator.sendBeacon` here before the browser navigates
 * away. Searches show intent; click-outs show which items and vendors actually
 * win — the signal that answers "which vendors are most popular" and later
 * feeds a demand-ranked browse order.
 *
 * We take the SIGNAL, not GetSet's MECHANISM: the outbound `href` stays a
 * direct, attributed vendor link (no proxy, no added latency, no stripped
 * referrer). This endpoint only records; it never sits in the navigation path.
 *
 * Auth is optional by design — browse is open, so most click-outs come from
 * signed-out visitors. We attach the session org when there is one and record
 * a null-org event otherwise. This is unmetered demand data, so a forged beacon
 * only pollutes analytics rather than stealing quota; the source/surface
 * allow-lists keep the payload well-formed.
 */

// Where the click-out originated. A tiny closed set so the demand data stays
// groupable and a forged beacon can't invent surfaces.
const SURFACES = ['item_detail'] as const;
type Surface = (typeof SURFACES)[number];

const MAX_ITEM_ID = 256;

function isSource(v: unknown): v is Source {
  return typeof v === 'string' && v in SOURCE_META;
}

function isSurface(v: unknown): v is Surface {
  return typeof v === 'string' && (SURFACES as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  // sendBeacon posts a Blob; a plain fetch posts JSON. Both parse the same way,
  // and a malformed body is just a dropped beacon, never a 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { itemId, source, surface } = (body ?? {}) as Record<string, unknown>;

  // Validate rather than trust: garbage in the demand stream is worse than a
  // dropped event, since nothing downstream re-checks these keys.
  if (
    typeof itemId !== 'string' ||
    itemId.length === 0 ||
    itemId.length > MAX_ITEM_ID ||
    !isSource(source) ||
    !isSurface(surface)
  ) {
    return new NextResponse(null, { status: 204 });
  }

  const orgId = await currentOrgId();

  // recordEvents never throws — a beacon must not error out the caller (who is
  // already navigating away regardless).
  await recordEvents({
    orgId,
    type: 'outbound_click',
    payload: { itemId, source, surface },
  });

  return new NextResponse(null, { status: 204 });
}
