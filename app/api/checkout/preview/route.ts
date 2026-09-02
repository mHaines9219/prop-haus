import { NextResponse } from 'next/server';
import { currentSession } from '@/lib/session';
import { normalizeAddress, orderDefaults, orderReadiness } from '@/lib/order-profile';
import { getOrderProfile } from '@/lib/order-profile-store';
import { getVendorMinimums } from '@/lib/insurance/minimums';
import { composeOutreach } from '@/lib/outreach/compose';
import { VENDORS } from '@/lib/vendors';
import type { CartLineInput } from '@/lib/orders';

type PreviewBody = {
  lines: CartLineInput[];
  rentalStart?: string;
  rentalEnd?: string;
  deliveryAddress?: unknown;
  deliveryNotes?: string;
};

/**
 * The emails the click will send, exactly as it will send them, with the
 * profile defaults applied. Pure read: same body shape as /api/checkout.
 */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as PreviewBody;
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'cart is empty' }, { status: 400 });
  }

  const profile = await getOrderProfile(session.orgId);
  const readiness = orderReadiness(profile);
  const defaults = orderDefaults(profile);
  const vendorIds = [...new Set(body.lines.map((l) => l.source))];
  const minimums = await getVendorMinimums(vendorIds).catch(() => ({}));

  const drafts = composeOutreach({
    lines: body.lines,
    rentalStart: body.rentalStart || defaults.rentalStart,
    rentalEnd: body.rentalEnd || defaults.rentalEnd,
    deliveryAddress: normalizeAddress(body.deliveryAddress) ?? defaults.deliveryAddress,
    deliveryNotes: body.deliveryNotes?.trim() || defaults.deliveryNotes,
    profile,
    vendors: VENDORS,
    minimums,
    fallbackTo: process.env.OUTREACH_FALLBACK_TO,
  });

  return NextResponse.json({ drafts, readiness });
}
