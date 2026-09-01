import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { currentOrgId } from '@/lib/session';
import { CLIP_SOURCE, type ClipMeta } from '@/lib/types';
import { ProjectItemInputSchema, type ProjectItemInput } from '@/lib/projects';
import { isSafeExternalUrl } from '@/lib/safe-url';
import { SafeFetchError, safeFetchHtml } from '@/lib/clip/safe-fetch';
import { parseListing } from '@/lib/clip/parse';
import { canonicalizeUrl, retailerNameFor } from '@/lib/clip/retailers';
import { getImageStore } from '@/lib/clip/image-store';

/**
 * POST /api/clip — MVP-7 web clipper (v1: paste a link).
 *
 * Fetches a product listing the user pasted, extracts a preview, and returns a
 * ready-to-save folder item. It does NOT write to a folder itself: the client
 * confirms the preview and POSTs the returned `item` through the existing
 * /api/projects/[id]/items route. That split is deliberate — the FUT-3 Chrome
 * extension reuses this endpoint unchanged.
 *
 * Responses:
 *   200 { item }                        — parsed; ready to confirm + save
 *   422 { error:'unreadable', draft }   — bot wall / SPA shell; client offers
 *                                         manual entry seeded from `draft`
 *   400 { error:'invalid'|'blocked' }   — bad URL, or one we refuse to reach
 *   401 { error:'not signed in' }
 *   429 { error:'rate_limited' }
 */

// This endpoint fetches arbitrary URLs on our dime, so cap it per org. In-memory
// is fine for v1 (single region, low volume) and needs no secrets; move to the
// usage-counter table if it ever runs multi-instance.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 30;
const clipHits = new Map<string, number[]>();

function rateLimited(orgId: string, now: number): boolean {
  const recent = (clipHits.get(orgId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    clipHits.set(orgId, recent);
    return true;
  }
  recent.push(now);
  clipHits.set(orgId, recent);
  return false;
}

const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');
const clipItemId = (canonical: string) => `${CLIP_SOURCE}:${sha1(canonical)}`;

export async function POST(req: Request) {
  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url || !isSafeExternalUrl(url)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  if (rateLimited(orgId, Date.now())) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let fetched: { finalUrl: string; html: string };
  try {
    fetched = await safeFetchHtml(url);
  } catch (err) {
    if (err instanceof SafeFetchError) {
      // A URL we couldn't even safely reach is a hard error — no manual path.
      if (err.reason === 'invalid' || err.reason === 'blocked') {
        return NextResponse.json({ error: err.reason }, { status: 400 });
      }
      // Reachable but unreadable (bot wall, timeout, oversized). Offer manual
      // entry seeded from what we can derive from the URL alone.
      return NextResponse.json(
        { error: 'unreadable', draft: draftFor(canonicalizeUrl(url)) },
        { status: 422 },
      );
    }
    throw err;
  }

  const canonical = canonicalizeUrl(fetched.finalUrl);
  const preview = parseListing(fetched.html, canonical);
  if (!preview) {
    return NextResponse.json(
      { error: 'unreadable', draft: draftFor(canonical) },
      { status: 422 },
    );
  }

  const itemId = clipItemId(canonical);

  // Snapshot the image (best-effort; falls back to the live URL). Only mirror a
  // safe http(s) image — a listing could publish a relative or javascript: src.
  let image: string | undefined;
  if (preview.image && isSafeExternalUrl(preview.image)) {
    const stored = await getImageStore().put(preview.image, sha1(canonical));
    image = isSafeExternalUrl(stored) ? stored : preview.image;
  }

  const meta: ClipMeta = {
    retailer: preview.retailer,
    ...(preview.price ? { price: preview.price } : {}),
    ...(preview.description ? { description: preview.description } : {}),
  };

  const item: ProjectItemInput = {
    itemId,
    source: CLIP_SOURCE,
    sourceId: canonical,
    name: preview.name,
    ...(image ? { image } : {}),
    sourceUrl: canonical,
    meta,
  };

  // Validate our own assembled item against the same schema the save route uses,
  // so a malformed clip is caught here rather than at write time.
  const parsed = ProjectItemInputSchema.safeParse(item);
  if (!parsed.success) {
    return NextResponse.json({ error: 'unreadable', draft: draftFor(canonical) }, { status: 422 });
  }

  return NextResponse.json({ item: parsed.data });
}

/** Seed for the manual-entry fallback: identity is known even when parsing failed. */
function draftFor(canonical: string) {
  return {
    itemId: clipItemId(canonical),
    source: CLIP_SOURCE,
    sourceId: canonical,
    sourceUrl: canonical,
    retailer: retailerNameFor(canonical),
  };
}
