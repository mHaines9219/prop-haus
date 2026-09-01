/**
 * GET /api/spacelab/catalog — our generated models in Spacelab's catalog format.
 *
 *   ?scene=<id>&token=…  the entries one prepared room needs (what the deep
 *                        link points at — smaller, and scoped to that room)
 *   (no params)          every model that has a mesh: the Prop Haus shelf,
 *                        browsable inside Spacelab's catalog panel
 *
 * Public and CORS-open, like Spacelab's own /assets/catalog.json: it carries
 * item names, sizes, tags and mesh URLs built from already-public listing
 * photos. Nothing here says who ordered what — that lives on the scene, which
 * is token-gated.
 */

import { NextResponse } from 'next/server';
import { assetIdsForScene } from '@/lib/spacelab/handoff';
import { catalogEntriesFor, fullCatalog } from '@/lib/spacelab/catalog';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sceneId = url.searchParams.get('scene');
  const token = url.searchParams.get('token') ?? '';

  if (sceneId) {
    const assetIds = await assetIdsForScene(sceneId, token);
    if (!assetIds) {
      return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS });
    }
    return NextResponse.json(await catalogEntriesFor(assetIds), {
      headers: { ...CORS, 'Cache-Control': 'private, no-store' },
    });
  }

  const entries = await fullCatalog();
  return NextResponse.json(entries, {
    // The shelf changes only when models are generated, so a short shared cache
    // is safe and keeps Spacelab's panel snappy.
    headers: { ...CORS, 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
