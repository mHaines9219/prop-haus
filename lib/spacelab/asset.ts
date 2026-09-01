/**
 * Catalog item → Spacelab asset identity, size, and taxonomy (FUT-2).
 *
 * Pure functions only: no DB, no network, no env. Everything here is decided by
 * the catalog row, so the same item yields the same asset every time — which is
 * what makes the generated GLB cacheable across every user who orders it.
 */

import type { PropItem } from '../types';
import { SOURCE_META } from '../types';

/** Namespace prefix on every asset id we publish into Spacelab's catalog. */
export const ASSET_PREFIX = 'prophaus';

const IN_PER_M = 39.37007874;

/**
 * `prophaus:<source>:<sourceId>` — stable across regenerations and unique
 * against Spacelab's own hand-authored ids (which carry no colon).
 *
 * Vendor source ids are arbitrary strings (paths, slugs, numeric ids), and this
 * value ends up in a URL path and a JSON key, so anything outside
 * `[A-Za-z0-9._-]` is percent-escaped rather than passed through.
 */
export function assetIdFor(source: string, sourceId: string): string {
  return `${ASSET_PREFIX}:${source}:${encodeAssetSegment(sourceId)}`;
}

/** Inverse of `assetIdFor`. Returns null for an id that is not one of ours. */
export function parseAssetId(assetId: string): { source: string; sourceId: string } | null {
  const parts = assetId.split(':');
  if (parts.length !== 3 || parts[0] !== ASSET_PREFIX) return null;
  const [, source, encoded] = parts;
  if (!source || !encoded) return null;
  try {
    return { source, sourceId: decodeURIComponent(encoded) };
  } catch {
    return null; // malformed percent-escape
  }
}

function encodeAssetSegment(raw: string): string {
  return encodeURIComponent(raw).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export type DimsM = { w: number; h: number; d: number };

/**
 * Where a piece sits by default, and roughly how big it is when the vendor
 * never published dimensions — which is the common case in our scraped catalog.
 *
 * PLACEHOLDER: replace with measured medians once enough of the catalog carries
 * real dimensions (MVP-6 #3's parsed-dimensions backfill is the intended
 * source). Values are inches, w × h × d, chosen to read as plausible on a floor
 * plan rather than to be accurate for any one piece.
 */
export const CATEGORY_FALLBACK_IN: Record<string, [number, number, number]> = {
  seating: [72, 32, 34],
  'tables-desks': [54, 30, 30],
  lighting: [16, 60, 16],
  'artwork-wall': [36, 48, 2],
  'rugs-floor': [96, 1, 60],
  'mirrors-decorative-objects': [24, 36, 3],
  'floral-plants': [24, 40, 24],
  'linens-textiles': [20, 6, 16],
  'storage-credenzas': [60, 32, 20],
  'electronics-tech': [20, 16, 14],
  'kitchen-tableware': [12, 10, 12],
  'beds-bedroom': [60, 40, 80],
  'bars-counters': [72, 42, 26],
  sculptures: [18, 30, 18],
  'graphics-signage': [36, 24, 2],
  'event-essentials': [30, 30, 30],
  'outdoor-garden': [40, 30, 30],
  'sports-recreation': [30, 24, 18],
  'accessories-hand-props': [10, 8, 8],
  office: [48, 30, 24],
  'bed-bath': [24, 24, 18],
  'industrial-hardware': [24, 24, 24],
  'specialized-environments': [48, 48, 36],
  'medical-anatomical': [24, 48, 20],
  'weapons-military': [36, 8, 8],
  'vehicles-transport': [70, 50, 30],
  'rigged-effects': [30, 30, 30],
  other: [24, 24, 24],
};

const DEFAULT_FALLBACK_IN: [number, number, number] = CATEGORY_FALLBACK_IN.other;

/** Clamp mirroring wasm-bindings' MIN_DIMENSION_M, so a typed 0 can't collapse a box. */
const MIN_DIMENSION_M = 0.05;
/** Nothing in a prop house is 30 m across; a bad parse should not blow up the room. */
const MAX_DIMENSION_M = 12;

/**
 * Real-world size in metres for a catalog item, falling back per category.
 *
 * Vendor dimensions are inches (`Dimensions.unit` is the literal `'in'`), and
 * Spacelab is metric throughout. Each axis falls back independently: a listing
 * that published a width and a height but no depth keeps both real numbers.
 */
export function dimsMetresFor(item: {
  category?: string;
  dimensions?: { width?: number; depth?: number; height?: number };
}): DimsM {
  const fallback = CATEGORY_FALLBACK_IN[item.category ?? ''] ?? DEFAULT_FALLBACK_IN;
  const d = item.dimensions;
  return {
    w: inchesToMetres(d?.width, fallback[0]),
    h: inchesToMetres(d?.height, fallback[1]),
    d: inchesToMetres(d?.depth, fallback[2]),
  };
}

/** True when every axis came from the vendor rather than a category fallback. */
export function hasRealDimensions(item: {
  dimensions?: { width?: number; depth?: number; height?: number };
}): boolean {
  const d = item.dimensions;
  return !!d && [d.width, d.height, d.depth].every((v) => typeof v === 'number' && v > 0);
}

function inchesToMetres(value: number | undefined, fallbackInches: number): number {
  const inches = typeof value === 'number' && value > 0 ? value : fallbackInches;
  const metres = inches / IN_PER_M;
  return round3(Math.min(MAX_DIMENSION_M, Math.max(MIN_DIMENSION_M, metres)));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/**
 * Prop Haus category → Spacelab's six-category vocabulary (`bed`, `decor`,
 * `lighting`, `seating`, `storage`, `table`), which is what its catalog filter
 * chips are built from. Anything without an obvious home reads as `decor` —
 * that bucket is where its own catalog puts the miscellany too.
 */
export const CATEGORY_TO_SPACELAB: Record<string, string> = {
  seating: 'seating',
  'tables-desks': 'table',
  lighting: 'lighting',
  'storage-credenzas': 'storage',
  'beds-bedroom': 'bed',
  'bars-counters': 'table',
  office: 'table',
  'bed-bath': 'storage',
};

export function spacelabCategoryFor(category?: string): string {
  return CATEGORY_TO_SPACELAB[category ?? ''] ?? 'decor';
}

/** Whether a piece hangs on a wall rather than standing on the floor. */
const WALL_CATEGORIES = new Set(['artwork-wall', 'mirrors-decorative-objects', 'graphics-signage']);

export function anchorFor(category?: string): 'floor' | 'wall' {
  return WALL_CATEGORIES.has(category ?? '') ? 'wall' : 'floor';
}

/**
 * Search tags for the catalog panel. Drawn from the enrichment fields the AI
 * pass already fills in, deduped and lowercased, capped so one over-tagged item
 * can't dominate the panel's filter.
 */
export function tagsFor(item: Partial<PropItem>): string[] {
  const raw = [
    item.category,
    item.subcategory,
    ...(item.style ?? []),
    ...(item.era ? [item.era] : []),
    ...(item.materials ?? []),
    ...(item.colors ?? []),
    ...(item.tags ?? []),
  ];
  const seen = new Set<string>();
  for (const t of raw) {
    if (!t) continue;
    const tag = String(t).trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 12);
}

/** Vendor display name for attribution in the Spacelab catalog entry. */
export function vendorNameFor(source: string): string {
  return SOURCE_META[source as keyof typeof SOURCE_META]?.name ?? source;
}
