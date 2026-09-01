/**
 * GET /api/spacelab/scenes/<id>?token=… — the room file.
 *
 * Two consumers, one payload:
 *   - a deployed Spacelab fetching the room cross-origin (hence CORS and the
 *     bearer token: it is a static app on another origin with no session here)
 *   - the user downloading `room.json` to use Spacelab's "import room" button,
 *     which is the fallback while Spacelab has no deployment (`?download=1`)
 *
 * The token is the authorization. It is minted per room, never exposed through
 * the Data API, and rotating it means re-preparing the room.
 */

import { NextResponse } from 'next/server';
import { getSceneByToken } from '@/lib/spacelab/handoff';

type Params = { params: Promise<{ id: string }> };

const CORS = {
  // Spacelab's deployment host is not known at build time, and the payload is
  // already gated on an unguessable token rather than on origin.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';

  const scene = await getSceneByToken(id, token);
  if (!scene) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS });
  }

  const headers: Record<string, string> = {
    ...CORS,
    'Content-Type': 'application/json',
    // A room changes when it is re-prepared, and it is addressed by a bearer
    // token — neither is safe to cache in a shared cache.
    'Cache-Control': 'private, no-store',
  };
  if (url.searchParams.get('download')) {
    headers['Content-Disposition'] = `attachment; filename="prop-haus-room-${id.slice(0, 8)}.json"`;
  }

  return new NextResponse(JSON.stringify(scene), { headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
