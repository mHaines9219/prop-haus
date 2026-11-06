import { getOrderById } from '@/lib/orders';
import { seedsForOrder } from '../handoff';
import { vendorNameFor } from '../asset';
import type { ModelSeed } from '../models';
import type { Scene, StudioItem } from './scene';

/**
 * An order becomes a studio scene: one item per distinct piece on the order,
 * at its catalog size (vendor dimensions, or the per-category guess the
 * handoff already makes), staged in rows along the back wall of a room
 * sized to hold them. The model then moves them around.
 *
 * The scene is in feet; the handoff seeds are in metres.
 */

const FT_PER_M = 3.28084;
const MIN_ROOM = { width: 12, depth: 10 };
const MAX_ROOM = { width: 40, depth: 30 };
/** Clear floor past the staged rows, so the set has a middle to arrange into. */
const CLEARANCE = 8;
const GAP = 1;
const INSET = 1;

const ft = (m: number) => Math.round(m * FT_PER_M * 10) / 10;

export function sceneFromSeeds(seeds: ModelSeed[]): Scene {
  const items: StudioItem[] = seeds.map((seed) => ({
    id: seed.assetId,
    name: seed.title,
    vendor: vendorNameFor(seed.source),
    size: { w: ft(seed.dims.w), d: ft(seed.dims.d), h: ft(seed.dims.h) },
  }));

  const width = deriveWidth(items);
  const rows = layOutRows(items, width);
  const stagedDepth = rows.reduce((sum, row) => sum + row.depth + GAP, INSET);
  const depth = clamp(Math.ceil(stagedDepth + CLEARANCE), MIN_ROOM.depth, MAX_ROOM.depth);

  const placements: Scene['placements'] = {};
  let z = INSET;
  for (const row of rows) {
    if (z + row.depth > depth - INSET) break;
    for (const { item, x } of row.items) {
      placements[item.id] = { x: round1(x), z: round1(z + item.size.d / 2), rotation: 0 };
    }
    z += row.depth + GAP;
  }

  return { room: { width, depth, height: 10 }, items, placements };
}

/** The order's scene. Throws like getOrderById when the order is not this org's. */
export async function sceneForOrder(orderId: string, orgId: string): Promise<Scene> {
  const order = await getOrderById(orderId, orgId);
  return sceneFromSeeds(await seedsForOrder(order));
}

type Row = { items: { item: StudioItem; x: number }[]; depth: number };

/** A room a few times the footprint of what goes in it, to the nearest foot. */
function deriveWidth(items: StudioItem[]): number {
  const area = items.reduce((sum, i) => sum + i.size.w * i.size.d, 0);
  return clamp(Math.ceil(Math.sqrt(area * 5)), MIN_ROOM.width, MAX_ROOM.width);
}

/** Greedy rows along the back wall, in order, each piece stepping by its own width. */
function layOutRows(items: StudioItem[], roomWidth: number): Row[] {
  const rows: Row[] = [];
  let row: Row = { items: [], depth: 0 };
  let x = INSET;
  for (const item of items) {
    const w = Math.min(item.size.w, roomWidth - INSET * 2);
    if (row.items.length && x + w > roomWidth - INSET) {
      rows.push(row);
      row = { items: [], depth: 0 };
      x = INSET;
    }
    row.items.push({ item, x: x + w / 2 });
    row.depth = Math.max(row.depth, item.size.d);
    x += w + GAP;
  }
  if (row.items.length) rows.push(row);
  return rows;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const round1 = (n: number) => Math.round(n * 10) / 10;
