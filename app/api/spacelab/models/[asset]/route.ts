/**
 * GET /api/spacelab/models/<assetId>.glb — the mesh for one catalog item.
 *
 * This is the no-bucket posture from lib/spacelab/storage.ts: with no
 * SPACELAB_ASSET_BUCKET configured, a model's URL points here and the mesh is
 * rebuilt per request instead of being stored. That is only viable because the
 * mock generator is deterministic and local — the moment a paid provider is
 * wired, set the bucket so meshes are written once (storage.ts warns about
 * exactly this combination).
 *
 * Public and CORS-open: three.js fetches it cross-origin from Spacelab, and the
 * bytes are derived from an already-public listing photo.
 */

import { NextResponse } from 'next/server';
import { getModel } from '@/lib/spacelab/models';
import { renderMockGlb } from '@/lib/spacelab/provider';
import { GLB_CONTENT_TYPE, decodeAssetPath } from '@/lib/spacelab/storage';

type Params = { params: Promise<{ asset: string }> };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export async function GET(_req: Request, { params }: Params) {
  const { asset } = await params;
  // The URL carries "<base64url asset id>.glb" so the path reads as a model file
  // to any loader, and carries no character a proxy might object to (see
  // modelRouteUrl).
  const assetId = decodeAssetPath(asset.replace(/\.glb$/i, ''));

  const model = assetId ? await getModel(assetId) : null;
  if (!model) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS });
  }

  const glb = await renderMockGlb({
    assetId: model.assetId,
    title: model.title,
    ...(model.imageUrl ? { imageUrl: model.imageUrl } : {}),
    dims: model.dims,
  });

  return new NextResponse(glb as unknown as BodyInit, {
    headers: {
      ...CORS,
      'Content-Type': GLB_CONTENT_TYPE,
      'Content-Length': String(glb.byteLength),
      // Deterministic per (dims, photo), so it caches like a static asset. A
      // regenerated model changes its dims, and dims are part of the row this
      // reads — a stale copy is at worst one minute old.
      'Cache-Control': 'public, max-age=60, s-maxage=3600',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
