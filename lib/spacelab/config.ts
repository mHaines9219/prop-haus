/**
 * Environment for the Spacelab handoff (FUT-2). Everything here is optional:
 * with nothing set, the pipeline still runs end to end on the mock provider and
 * the room file downloads. See .env.local.example.
 */

/**
 * Where Spacelab is deployed. Null until it is — the order page then offers the
 * room file for download and Spacelab's own "import room" button, which is the
 * fallback the brief calls for (it is a static Vite app with no host yet).
 */
export function spacelabBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SPACELAB_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * Our own origin, for the absolute URLs that go INTO the handoff: Spacelab
 * fetches the catalog and the GLBs cross-origin, so a relative path is useless
 * there. Falls back to the Vercel-provided host, then to local dev.
 */
export function siteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}

/**
 * The deep link that opens a prepared room. Spacelab reads `?room=<url>` after
 * the loader change in docs/spacelab-integration.md; `catalog` points it at the
 * entries for that room's assets. Null when Spacelab has no deployment yet.
 */
export function spacelabRoomUrl(sceneId: string, token: string): string | null {
  const base = spacelabBaseUrl();
  if (!base) return null;
  const site = siteBaseUrl();
  const room = `${site}/api/spacelab/scenes/${sceneId}?token=${encodeURIComponent(token)}`;
  const catalog = `${site}/api/spacelab/catalog?scene=${sceneId}&token=${encodeURIComponent(token)}`;
  return `${base}/?room=${encodeURIComponent(room)}&catalog=${encodeURIComponent(catalog)}`;
}
