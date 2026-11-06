import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import {
  applyProductionPatch,
  normalizeAddress,
  normalizeProductionPatch,
  orderDefaults,
  orderReadiness,
} from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';
import { getPassport } from '@/lib/passport-store';
import { EMPTY_PASSPORT } from '@/lib/passport';
import { getVendorMinimums } from '@/lib/insurance/minimums';
import { composeOutreach } from '@/lib/outreach/compose';
import { VENDORS } from '@/lib/vendors';
import { parseCartLines } from '@/lib/orders';

type PreviewBody = {
  lines?: unknown;
  rentalStart?: unknown;
  rentalEnd?: unknown;
  deliveryAddress?: unknown;
  deliveryNotes?: unknown;
  shootDetails?: unknown;
  /** The cart's production fields, applied for the preview but not saved. */
  production?: unknown;
};

/**
 * The emails the click will send, exactly as it will send them, with the
 * profile defaults applied. Pure read: same body shape as /api/checkout.
 */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PreviewBody | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'cart is empty' }, { status: 400 });
  }
  const lines = parseCartLines(body.lines);
  if (!lines) {
    return NextResponse.json({ error: 'a cart line is invalid' }, { status: 400 });
  }

  const stored = await getOrderProfile(session.orgId);
  const production = normalizeProductionPatch(body.production);
  const profile = production ? applyProductionPatch(stored, production, { userId: session.userId }) : stored;
  const readiness = orderReadiness(profile);
  const defaults = orderDefaults(profile);
  const vendorIds = [...new Set(lines.map((l) => l.source))];
  const [minimums, passport] = await Promise.all([
    getVendorMinimums(vendorIds).catch(() => ({})),
    getPassport(session.orgId).catch(() => EMPTY_PASSPORT),
  ]);

  const drafts = composeOutreach({
    lines,
    rentalStart: (typeof body.rentalStart === 'string' && body.rentalStart) || defaults.rentalStart,
    rentalEnd: (typeof body.rentalEnd === 'string' && body.rentalEnd) || defaults.rentalEnd,
    // Pickup is assumed; an address prints only when the caller sent one.
    deliveryAddress: normalizeAddress(body.deliveryAddress),
    deliveryNotes: typeof body.deliveryNotes === 'string' ? body.deliveryNotes.trim() || undefined : undefined,
    shootDetails: typeof body.shootDetails === 'string' ? body.shootDetails.trim() || undefined : undefined,
    profile,
    vendors: VENDORS,
    minimums,
    passport,
    fallbackTo: process.env.OUTREACH_FALLBACK_TO,
    bookingFlow: session.sandbox,
  });

  return NextResponse.json({ drafts, readiness });
}
