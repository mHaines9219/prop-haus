/**
 * Build a Spacelab room from an order (FUT-2, phase 3).
 *
 * Pure: items in, `SaveFile` out. No DB, no env, no clock — so the same order
 * always produces the same room, and the whole thing is testable without a
 * browser or a WASM build.
 *
 * WHY WE AUTHOR THE FILE RATHER THAN DRIVE THE WASM API. `Document` exposes
 * `set_rectangle` / `add_furnishing_aside`, but it only exists inside the
 * browser that loaded Spacelab. The handoff happens on our server, before
 * Spacelab is open, so we write the save envelope its `load_json` reads — the
 * same file its own export produces. The wall layout below is a faithful copy of
 * `set_rectangle`: two walls (the near pair is deliberately omitted so the room
 * reads as a dollhouse), over a floor outline of all four corners.
 *
 * The staging line is NOT a copy of `aside_target`. That helper steps a fixed
 * 0.8 m per slot because it places one piece at a time and cannot see the rest;
 * we have the whole order in hand, so pieces step by their own width and wrap
 * into fresh rows — a 2.4 m sofa does not land on top of the next piece.
 */

import {
  SAVE_VERSION,
  WALL_HEIGHT_M,
  WALL_THICKNESS_M,
  type Furnishing,
  type SaveFile,
  type Vec2,
  type Wall,
} from './scene-format';
import type { DimsM } from './asset';

export type SceneItem = {
  assetId: string;
  dims: DimsM;
};

export type BuildSceneOptions = {
  /** Force a room size instead of deriving one from the set. Metres. */
  room?: { widthM: number; depthM: number };
};

/** Distance from the side walls that a staged row keeps. */
const ROW_INSET_M = 0.5;
/** Gap between two pieces in a row, and between rows. */
const GAP_M = 0.3;
/** Smallest sensible room, so a two-item order isn't staged in a corridor. */
const MIN_ROOM_M = { width: 5, depth: 4 };
/**
 * Largest room we will generate. Past this the room stops reading as a set and
 * starts reading as a warehouse; the overflow goes to the bullpen instead.
 */
const MAX_ROOM_M = { width: 14, depth: 12 };
/** Open floor kept clear beyond the staged rows, so the set has a middle. */
const CLEARANCE_M = 2;

export function buildScene(items: SceneItem[], opts: BuildSceneOptions = {}): SaveFile {
  const width = opts.room ? clampRoom(opts.room.widthM, MIN_ROOM_M.width, MAX_ROOM_M.width) : null;

  const roomWidth = width ?? deriveRoomWidth(items);
  const rows = layOutRows(items, roomWidth);
  const stagedDepth = rows.reduce((sum, row) => sum + row.depth + GAP_M, 0);
  const roomDepth = opts.room
    ? clampRoom(opts.room.depthM, MIN_ROOM_M.depth, MAX_ROOM_M.depth)
    : clampRoom(stagedDepth + CLEARANCE_M, MIN_ROOM_M.depth, MAX_ROOM_M.depth);

  const walls = rectangleWalls(roomWidth, roomDepth);
  const furnishings: Furnishing[] = [];

  let z = ROW_INSET_M;
  let nextId = 1;
  for (const row of rows) {
    // A row that would sit past the far wall is stashed rather than pushed
    // through it: the bullpen keeps those pieces in the document, with their
    // identity and size, for the user to pull in once they have made room.
    const fits = z + row.depth <= roomDepth - ROW_INSET_M;
    for (const placed of row.items) {
      furnishings.push({
        id: nextId++,
        asset: { extent: [placed.item.dims.w, placed.item.dims.h, placed.item.dims.d], asset_id: placed.item.assetId },
        placement: {
          // Row pieces sit against the near wall facing into the room, which is
          // +Z — the assets' own front, so yaw stays 0.
          position: [round3(placed.x), 0, round3(z + row.depth / 2)],
          yaw: 0,
          anchor: 'Floor',
        },
        scale: [1, 1, 1],
        stashed: !fits,
      });
    }
    z += row.depth + GAP_M;
  }

  return {
    version: SAVE_VERSION,
    scene: {
      walls,
      openings: [],
      furnishings,
      floor_material: 'WoodLight',
      wall_material: 'WarmWhite',
      lighting: 'Noon',
      floor_outline: rectangleOutline(roomWidth, roomDepth),
    },
    // Allocators have to clear every id in the file, or the user's first
    // placement collides with one of ours and edits the wrong object.
    next_ids: { wall: walls.length, opening: 0, furnishing: nextId },
  };
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

/**
 * `set_rectangle` raises exactly two of the four walls — the far and left sides
 * — leaving the near pair open so the camera looks into the room rather than at
 * the back of a wall. The floor keeps its whole rectangular footprint either way.
 */
function rectangleWalls(width: number, depth: number): Wall[] {
  const corners: Vec2[] = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
  const segments: [Vec2, Vec2][] = [
    [corners[3], corners[0]],
    [corners[0], corners[1]],
  ];
  return segments.map(([start, end], i) => ({
    id: i,
    start,
    end,
    thickness: WALL_THICKNESS_M,
    height: WALL_HEIGHT_M,
    origin: 'Generated',
  }));
}

function rectangleOutline(width: number, depth: number): Vec2[] {
  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
}

/**
 * A room roughly six times the footprint of what is going in it — enough floor
 * to walk the set around, without a cathedral for three lamps. Rounded to the
 * half metre so the generated room reads as a deliberate size.
 */
function deriveRoomWidth(items: SceneItem[]): number {
  const footprint = items.reduce((sum, i) => sum + i.dims.w * i.dims.d, 0);
  const widest = items.reduce((max, i) => Math.max(max, i.dims.w), 0);
  const square = Math.sqrt(Math.max(footprint, 0) * 6);
  const width = Math.max(MIN_ROOM_M.width, square, widest + 2 * ROW_INSET_M);
  return clampRoom(Math.ceil(width * 2) / 2, MIN_ROOM_M.width, MAX_ROOM_M.width);
}

function clampRoom(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return round3(Math.min(max, Math.max(min, value)));
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

type PlacedItem = { item: SceneItem; x: number };
type Row = { items: PlacedItem[]; depth: number };

/**
 * Greedy rows along the room's width, in order. Each piece steps by its own
 * width plus a gap; a piece that would cross the far side wall starts the next
 * row. Order is preserved so the row reads like the order does.
 */
function layOutRows(items: SceneItem[], roomWidth: number): Row[] {
  const rows: Row[] = [];
  const limit = roomWidth - ROW_INSET_M;
  let current: Row | null = null;
  let cursor = ROW_INSET_M;

  for (const item of items) {
    const width = Math.max(0.05, item.dims.w);
    // A piece wider than the room still gets placed — clamped into the row
    // rather than dropped, since the user can always move or scale it.
    const endsAt = cursor + width;
    if (current && endsAt > limit && current.items.length > 0) {
      rows.push(current);
      current = null;
      cursor = ROW_INSET_M;
    }
    if (!current) current = { items: [], depth: 0 };
    current.items.push({ item, x: Math.min(cursor + width / 2, limit) });
    current.depth = Math.max(current.depth, item.dims.d);
    cursor += width + GAP_M;
  }
  if (current && current.items.length > 0) rows.push(current);
  return rows;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
