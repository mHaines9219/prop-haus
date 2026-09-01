/**
 * Where a generated GLB lives so Spacelab can fetch it (FUT-2, phase 2).
 *
 * Spacelab loads models over plain HTTP with three.js' GLTFLoader, so a model
 * needs a public, stable, CORS-reachable URL. Two postures:
 *
 *   SupabaseModelStore   — a public Storage bucket. What production should use:
 *                          the bytes are written once and served by the CDN,
 *                          which is the point of caching a mesh per catalog item.
 *   RegeneratedModelStore — no bucket configured: hand back a URL to our own
 *                          /api/spacelab/models/… route, which rebuilds the mesh
 *                          from the cached row on request. Costs CPU per fetch
 *                          and only works because the mock generator is
 *                          deterministic and cheap — but it means the entire
 *                          flow demos with zero secrets, which is the rule.
 *
 * A real paid provider must NOT run under the regenerated store: regenerating
 * means re-calling the service on every fetch. `getModelStore` warns when that
 * combination is configured; the fix is to set SPACELAB_ASSET_BUCKET.
 */

import { createAdminClient } from '../supabase/admin';
import { parseAssetId } from './asset';
import { siteBaseUrl } from './config';

export const GLB_CONTENT_TYPE = 'model/gltf-binary';

export interface ModelStore {
  /** Persist (or address) the GLB for `assetId`, returning a fetchable URL. */
  put(assetId: string, glb: Uint8Array): Promise<string>;
  /** Whether bytes are actually retained. False means "regenerated per request". */
  readonly persists: boolean;
}

/** Public Supabase Storage bucket — the production posture. */
export class SupabaseModelStore implements ModelStore {
  readonly persists = true;

  constructor(private readonly bucket: string) {}

  async put(assetId: string, glb: Uint8Array): Promise<string> {
    const admin = createAdminClient();
    const path = storagePathFor(assetId);
    const { error } = await admin.storage
      .from(this.bucket)
      .upload(path, glb, { contentType: GLB_CONTENT_TYPE, upsert: true });
    if (error) throw new Error(`[spacelab] GLB upload failed: ${error.message}`);
    const { data } = admin.storage.from(this.bucket).getPublicUrl(path);
    if (!data.publicUrl) throw new Error('[spacelab] bucket returned no public URL');
    return data.publicUrl;
  }
}

/** No bucket: address the model by route and rebuild it per request. */
export class RegeneratedModelStore implements ModelStore {
  readonly persists = false;

  async put(assetId: string): Promise<string> {
    return modelRouteUrl(assetId);
  }
}

/** `prophaus/<source>/<source-id>.glb` — colons are not welcome in object keys. */
export function storagePathFor(assetId: string): string {
  const parsed = parseAssetId(assetId);
  if (!parsed) return `${assetId.replace(/[^A-Za-z0-9._-]/g, '_')}.glb`;
  const safeId = encodeURIComponent(parsed.sourceId).replace(/%/g, '_');
  return `prophaus/${parsed.source}/${safeId}.glb`;
}

/**
 * The absolute URL of the regenerating route for one asset.
 *
 * The id is base64url'd rather than percent-escaped. A vendor source id can
 * contain a slash, which survives `assetIdFor` as `%2F` and would then need to
 * be double-escaped into a path segment — and an encoded slash in a path is
 * rejected outright by a fair number of proxies and hosts. base64url has no
 * reserved characters at all, so the URL is inert wherever it is served.
 */
export function modelRouteUrl(assetId: string): string {
  return `${siteBaseUrl()}/api/spacelab/models/${encodeAssetPath(assetId)}.glb`;
}

export function encodeAssetPath(assetId: string): string {
  return Buffer.from(assetId, 'utf8').toString('base64url');
}

/** Inverse of `encodeAssetPath`; null when the segment is not valid base64url. */
export function decodeAssetPath(segment: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const decoded = Buffer.from(segment, 'base64url').toString('utf8');
  // Round-trip guard: base64url decoding accepts near-misses, and a mangled id
  // should 404 rather than look up something else.
  return decoded && encodeAssetPath(decoded) === segment ? decoded : null;
}

let cached: ModelStore | null = null;

export function getModelStore(): ModelStore {
  if (cached) return cached;

  const bucket = process.env.SPACELAB_ASSET_BUCKET;
  const hasKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (bucket && hasKey) {
    cached = new SupabaseModelStore(bucket);
  } else {
    const provider = process.env.SPACELAB_MODEL_PROVIDER ?? 'mock';
    if (provider !== 'mock') {
      // Silently regenerating against a paid service would re-bill every fetch.
      console.warn(
        `[spacelab] SPACELAB_MODEL_PROVIDER=${provider} with no SPACELAB_ASSET_BUCKET — ` +
          'generated meshes will not be retained. Set the bucket before using a paid provider.',
      );
    }
    cached = new RegeneratedModelStore();
  }
  return cached;
}

/** Test seam: drop the memoized store. */
export function resetModelStore(): void {
  cached = null;
}
