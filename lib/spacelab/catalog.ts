/**
 * Catalog bridge (FUT-2, phase 2): our generated models, in Spacelab's format.
 *
 * Spacelab has no runtime model injection — a furnishing's `asset_id` has to
 * resolve in a catalog it loaded, or the piece is skipped when the room opens
 * (`restoreFurnishings`, web/src/viewport.ts, skips unknown ids rather than
 * failing the load). So the handoff publishes two things: the room file, and
 * the catalog entries the room refers to.
 *
 * ABSOLUTE `blob` URLS NEED THE SPACELAB PATCH. Spacelab resolves an entry's
 * blob as `/assets/${blob}`, which is right for its own bundled models and
 * wrong for ours. The one-line loader change (and the extra-catalog fetch that
 * goes with it) is spec'd in docs/spacelab-integration.md. We publish absolute
 * URLs regardless: they are what a hosted catalog needs, and they are inert
 * until the patch lands.
 */

import type { SpacelabCatalogEntry } from './scene-format';
import { vendorNameFor } from './asset';
import { getModels, listReadyModels, type SpacelabModel } from './models';

export function catalogEntryFor(model: SpacelabModel): SpacelabCatalogEntry {
  return {
    asset_id: model.assetId,
    title: model.title,
    category: model.spacelabCategory,
    tags: model.tags,
    dims_m: model.dims,
    // Absolute, because Spacelab is a different origin from us.
    blob: model.glbUrl ?? '',
    source: vendorNameFor(model.source),
    source_url: null,
    license: null,
    // Attribution is not decoration here: the vendor owns this inventory, and
    // the platform's whole posture is to credit them (CLAUDE.md, Vendor
    // Philosophy). It rides along into anyone's Spacelab scene.
    attribution: `Inventory of ${vendorNameFor(model.source)}, via Prop Haus`,
    style: null,
    anchor: model.anchor,
    front: '+Z',
    // Generated from a photo, not measured or hand-authored. Spacelab's own
    // catalog uses this flag the same way.
    verified: false,
  };
}

/** Entries for a specific set of assets — what one prepared room needs. */
export async function catalogEntriesFor(assetIds: string[]): Promise<SpacelabCatalogEntry[]> {
  const models = await getModels(assetIds);
  return [...models.values()]
    .filter((m) => m.status === 'ready' && m.glbUrl)
    .map(catalogEntryFor);
}

/** Every model with a mesh — the browsable Prop Haus shelf inside Spacelab. */
export async function fullCatalog(limit?: number): Promise<SpacelabCatalogEntry[]> {
  const models = await listReadyModels(limit);
  return models.filter((m) => m.glbUrl).map(catalogEntryFor);
}
