/**
 * Image-to-3D provider interface (FUT-2, phase 1).
 *
 * Cart items carry photos, not geometry, so a set preview needs a mesh per
 * catalog item. That is a paid third-party call (Meshy, Tripo, a TRELLIS-class
 * host) and the partner is not chosen, so the whole pipeline runs behind this
 * interface with a mock that produces a real, loadable GLB. Choosing a service
 * later is one adapter file plus `SPACELAB_MODEL_PROVIDER=<name>`.
 *
 * GENERATION IS PER CATALOG ITEM, NOT PER ORDER. `lib/spacelab/models.ts` caches
 * every result in `spacelab_models` keyed by asset id, so the tenth production
 * to rent the same sofa reuses the first one's mesh. Providers here should stay
 * stateless and let that layer decide what actually needs generating.
 *
 * REAL ADAPTERS MUST NORMALIZE. See the model contract in `glb.ts`: metres,
 * origin centred on the footprint with the base at y = 0, front facing +Z. Most
 * services return a unit-ish mesh centred on its bounding box, so an adapter
 * has to re-scale to the catalog dims and lift the model onto the floor plane
 * before publishing, or every piece in the room floats or sinks.
 */

import { assertPublicUrl } from '../clip/safe-fetch';
import { buildBoxGlb, isTextureMimeType, type TextureMimeType } from './glb';
import type { DimsM } from './asset';
import { getModelStore, type ModelStore } from './storage';

export type ModelRequest = {
  /** `prophaus:<source>:<sourceId>` — the id the GLB is published under. */
  assetId: string;
  /** Item name, for provider-side prompts and debugging. */
  title: string;
  /** The item's best photo. Absent for an item whose listing had no image. */
  imageUrl?: string;
  /** Real-world size to normalize the mesh to, in metres. */
  dims: DimsM;
};

export type ModelResult =
  /** A mesh exists and is publicly fetchable. */
  | { status: 'ready'; glbUrl: string; externalJobId?: string }
  /** The service accepted the job; poll `externalJobId` for the result. */
  | { status: 'pending'; externalJobId: string }
  /** No mesh, and retrying now will not help. */
  | { status: 'failed'; error: string };

export interface Model3dProvider {
  /** Name recorded on the cached row, so a stale mesh can be traced to its maker. */
  readonly name: string;
  generate(req: ModelRequest): Promise<ModelResult>;
  /**
   * Check an async job. Optional: a provider that answers synchronously (the
   * mock) has nothing to poll.
   */
  poll?(externalJobId: string): Promise<ModelResult>;
}

// ---------------------------------------------------------------------------
// Mock — a correctly sized box wearing the item's photo. No secrets, no cost.
// ---------------------------------------------------------------------------

const IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export class MockBoxProvider implements Model3dProvider {
  readonly name = 'mock';

  constructor(private readonly store: ModelStore = getModelStore()) {}

  async generate(req: ModelRequest): Promise<ModelResult> {
    const glbUrl = await this.store.put(req.assetId, await renderMockGlb(req));
    return { status: 'ready', glbUrl };
  }
}

/**
 * The mock mesh for one item.
 *
 * PLACEHOLDER: a photo-mapped box stands in for a generated mesh. Exported
 * because the regenerating model route rebuilds the same bytes on demand when
 * no asset bucket is configured — the two paths must agree, so they share this
 * function rather than each having their own idea of what a mock model is.
 */
export async function renderMockGlb(req: ModelRequest): Promise<Uint8Array> {
  const texture = req.imageUrl ? await fetchTexture(req.imageUrl) : undefined;
  return buildBoxGlb({ dims: req.dims, name: req.title, ...(texture ? { texture } : {}) });
}

/**
 * Fetch a listing photo for texturing. Best-effort by design: a missing or
 * odd-format image costs the texture, never the model. Catalog images come from
 * vendor sites we scraped, so they go through the same SSRF guard as a user's
 * clipped URL rather than being trusted for being ours.
 */
async function fetchTexture(
  url: string,
): Promise<{ bytes: Uint8Array; mimeType: TextureMimeType } | undefined> {
  try {
    await assertPublicUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { redirect: 'error', signal: controller.signal });
      if (!res.ok) return undefined;
      const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      // glTF core carries JPEG and PNG only; anything else renders as nothing
      // at all in the viewer, which is worse than an untextured box.
      if (!isTextureMimeType(mimeType)) return undefined;
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return undefined;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return undefined;
      return { bytes, mimeType };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cached: Model3dProvider | null = null;

export function getModel3dProvider(): Model3dProvider {
  if (cached) return cached;

  const name = process.env.SPACELAB_MODEL_PROVIDER ?? 'mock';
  switch (name) {
    case 'mock':
      cached = new MockBoxProvider();
      break;
    // PLACEHOLDER: case 'meshy': cached = new MeshyAdapter(process.env.MESHY_API_KEY!); break;
    // PLACEHOLDER: case 'tripo':  cached = new TripoAdapter(process.env.TRIPO_API_KEY!); break;
    default:
      console.warn(`[spacelab] unknown SPACELAB_MODEL_PROVIDER "${name}" — using mock`);
      cached = new MockBoxProvider();
  }
  return cached;
}

/** Test seam: drop the memoized provider. */
export function resetModel3dProvider(): void {
  cached = null;
}
