/**
 * The generated-model cache (FUT-2, phase 1 storage side).
 *
 * One row per catalog item in `spacelab_models`, shared across every org: the
 * mesh for a sofa is the same mesh whoever rents it, and generating one costs a
 * paid API call. So the only questions this module answers are "does a mesh for
 * this asset already exist?" and "if not, make one and write down what happened".
 *
 * Failures are recorded, not thrown. A set preview with 19 of 22 pieces is
 * useful; one that 500s because a single vendor photo 404'd is not.
 */

import pLimit from 'p-limit';
import type { PropItem } from '../types';
import { createAdminClient } from '../supabase/admin';
import {
  anchorFor,
  assetIdFor,
  dimsMetresFor,
  hasRealDimensions,
  spacelabCategoryFor,
  tagsFor,
  type DimsM,
} from './asset';
import { getModel3dProvider } from './provider';

export type ModelStatus = 'pending' | 'ready' | 'failed';

export type SpacelabModel = {
  assetId: string;
  source: string;
  sourceId: string;
  title: string;
  category?: string;
  spacelabCategory: string;
  tags: string[];
  dims: DimsM;
  dimsSource: 'vendor' | 'fallback';
  imageUrl?: string;
  status: ModelStatus;
  provider?: string;
  externalJobId?: string;
  glbUrl?: string;
  errorMessage?: string;
  anchor: 'floor' | 'wall';
};

/** Everything needed to generate a model, derived from a catalog item. */
export type ModelSeed = {
  assetId: string;
  source: string;
  sourceId: string;
  title: string;
  category?: string;
  spacelabCategory: string;
  tags: string[];
  dims: DimsM;
  dimsSource: 'vendor' | 'fallback';
  imageUrl?: string;
};

/** How many generations run at once. Generous for the mock, polite to a real API. */
const GENERATE_CONCURRENCY = 4;

/**
 * Catalog item → model seed. The one place item data turns into Spacelab's
 * vocabulary, so a change to sizing or taxonomy lands everywhere at once.
 */
export function seedFromItem(item: PropItem): ModelSeed {
  return {
    assetId: assetIdFor(item.source, item.sourceId),
    source: item.source,
    sourceId: item.sourceId,
    title: item.name,
    ...(item.category ? { category: item.category } : {}),
    spacelabCategory: spacelabCategoryFor(item.category),
    tags: tagsFor(item),
    dims: dimsMetresFor(item),
    dimsSource: hasRealDimensions(item) ? 'vendor' : 'fallback',
    ...(item.images?.[0] ? { imageUrl: item.images[0] } : {}),
  };
}

/**
 * A seed for an item we could not find in the catalog — de-listed since
 * checkout, say. The order line still snapshots a name and a photo, which is
 * enough for a placeholder-sized box; the dimensions are the category fallback
 * by definition.
 */
export function seedFromOrderLine(line: {
  source: string;
  sourceId: string;
  name: string;
  image?: string;
}): ModelSeed {
  return {
    assetId: assetIdFor(line.source, line.sourceId),
    source: line.source,
    sourceId: line.sourceId,
    title: line.name,
    spacelabCategory: spacelabCategoryFor(undefined),
    tags: [],
    dims: dimsMetresFor({}),
    dimsSource: 'fallback',
    ...(line.image ? { imageUrl: line.image } : {}),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getModels(assetIds: string[]): Promise<Map<string, SpacelabModel>> {
  const ids = [...new Set(assetIds)];
  if (ids.length === 0) return new Map();

  const db = createAdminClient();
  const { data, error } = await db.from('spacelab_models').select('*').in('asset_id', ids);
  if (error) throw new Error(`[spacelab] model lookup failed: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.asset_id as string, toModel(row as ModelRow)]));
}

/** Every model that has a mesh — the full published catalog. */
export async function listReadyModels(limit = 5000): Promise<SpacelabModel[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('spacelab_models')
    .select('*')
    .eq('status', 'ready')
    .order('asset_id')
    .limit(limit);
  if (error) throw new Error(`[spacelab] catalog read failed: ${error.message}`);
  return (data ?? []).map((row) => toModel(row as ModelRow));
}

export async function getModel(assetId: string): Promise<SpacelabModel | null> {
  const found = await getModels([assetId]);
  return found.get(assetId) ?? null;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type EnsureOptions = {
  /** Regenerate even for assets that already have a mesh. */
  force?: boolean;
};

/**
 * Make sure every seed has a model row, generating the ones that don't.
 *
 * Reuse rules, in order: an existing `ready` row is reused as-is unless the
 * item's real-world size changed (a mesh built to the wrong dimensions is worse
 * than none); a `failed` row is retried, since the usual cause is a photo that
 * was temporarily unreachable; a `pending` row means another request is already
 * generating it, so we leave it alone rather than double-billing the provider.
 */
export async function ensureModels(
  seeds: ModelSeed[],
  opts: EnsureOptions = {},
): Promise<Map<string, SpacelabModel>> {
  const bySeed = new Map(seeds.map((s) => [s.assetId, s]));
  if (bySeed.size === 0) return new Map();

  const existing = await getModels([...bySeed.keys()]);
  const stale = [...bySeed.values()].filter((seed) => needsGeneration(seed, existing.get(seed.assetId), opts));

  if (stale.length === 0) return existing;

  const limit = pLimit(GENERATE_CONCURRENCY);
  const generated = await Promise.all(stale.map((seed) => limit(() => generateOne(seed))));

  const merged = new Map(existing);
  for (const model of generated) merged.set(model.assetId, model);
  return merged;
}

function needsGeneration(
  seed: ModelSeed,
  existing: SpacelabModel | undefined,
  opts: EnsureOptions,
): boolean {
  if (opts.force) return true;
  if (!existing) return true;
  if (existing.status === 'pending') return false; // another request owns it
  if (existing.status === 'failed') return true;
  if (!existing.glbUrl) return true;
  return !sameDims(existing.dims, seed.dims);
}

function sameDims(a: DimsM, b: DimsM): boolean {
  return a.w === b.w && a.h === b.h && a.d === b.d;
}

/**
 * Claim the row as `pending`, generate, then write the outcome. Claiming first
 * is what keeps two concurrent checkouts of the same item from both paying for
 * a mesh — the second sees `pending` and skips.
 */
async function generateOne(seed: ModelSeed): Promise<SpacelabModel> {
  const provider = getModel3dProvider();
  await upsertRow(seed, { status: 'pending', provider: provider.name });

  try {
    const result = await provider.generate({
      assetId: seed.assetId,
      title: seed.title,
      ...(seed.imageUrl ? { imageUrl: seed.imageUrl } : {}),
      dims: seed.dims,
    });

    switch (result.status) {
      case 'ready':
        return upsertRow(seed, {
          status: 'ready',
          provider: provider.name,
          glb_url: result.glbUrl,
          external_job_id: result.externalJobId ?? null,
          error_message: null,
        });
      case 'pending':
        // An async service took the job. The row stays pending; a later poll
        // (or the next prepare) picks it up.
        return upsertRow(seed, {
          status: 'pending',
          provider: provider.name,
          external_job_id: result.externalJobId,
        });
      default:
        return upsertRow(seed, {
          status: 'failed',
          provider: provider.name,
          error_message: result.error,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown generator error';
    return upsertRow(seed, { status: 'failed', provider: provider.name, error_message: message });
  }
}

async function upsertRow(seed: ModelSeed, patch: Record<string, unknown>): Promise<SpacelabModel> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('spacelab_models')
    .upsert(
      {
        asset_id: seed.assetId,
        source: seed.source,
        source_id: seed.sourceId,
        title: seed.title,
        category: seed.category ?? null,
        spacelab_category: seed.spacelabCategory,
        tags: seed.tags,
        dims_m: seed.dims,
        dims_source: seed.dimsSource,
        image_url: seed.imageUrl ?? null,
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: 'asset_id' },
    )
    .select('*')
    .single();

  if (error) throw new Error(`[spacelab] model write failed: ${error.message}`);
  return toModel(data as ModelRow);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type ModelRow = {
  asset_id: string;
  source: string;
  source_id: string;
  title: string;
  category: string | null;
  spacelab_category: string;
  tags: string[] | null;
  dims_m: DimsM;
  dims_source: string;
  image_url: string | null;
  status: string;
  provider: string | null;
  external_job_id: string | null;
  glb_url: string | null;
  error_message: string | null;
};

function toModel(row: ModelRow): SpacelabModel {
  return {
    assetId: row.asset_id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    ...(row.category ? { category: row.category } : {}),
    spacelabCategory: row.spacelab_category,
    tags: row.tags ?? [],
    dims: row.dims_m,
    dimsSource: row.dims_source === 'vendor' ? 'vendor' : 'fallback',
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    status: (row.status as ModelStatus) ?? 'pending',
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.external_job_id ? { externalJobId: row.external_job_id } : {}),
    ...(row.glb_url ? { glbUrl: row.glb_url } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    anchor: anchorFor(row.category ?? undefined),
  };
}
