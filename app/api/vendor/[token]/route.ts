import { NextResponse } from 'next/server';
import { updateLineStatus, type LineStatus, type Quote } from '@/lib/projects';
import { FLAT_FEE_UNITS, PRICE_UNITS } from '@/lib/types';

/** The vendor form is untrusted input — reject a malformed quote rather than store it. */
function parseQuote(raw: unknown): Quote | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const q = raw as Record<string, unknown>;
  const amount = Number(q.amount);
  const periods = Number(q.periods);
  const unit = q.unit;
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (typeof unit !== 'string' || !PRICE_UNITS.includes(unit as (typeof PRICE_UNITS)[number])) {
    return undefined;
  }
  const typedUnit = unit as (typeof PRICE_UNITS)[number];
  const safePeriods = FLAT_FEE_UNITS.includes(typedUnit)
    ? 1
    : Number.isFinite(periods) && periods > 0
      ? periods
      : 1;
  return {
    amount,
    unit: typedUnit,
    periods: safePeriods,
    currency: typeof q.currency === 'string' && q.currency ? q.currency : 'USD',
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json()) as {
    itemId: string;
    status: LineStatus;
    quote?: unknown;
    subNote?: string;
  };
  const result = await updateLineStatus(token, body.itemId, body.status, {
    quote: parseQuote(body.quote),
    subNote: body.subNote,
  });
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
