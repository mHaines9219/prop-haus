/**
 * Spacelab's save format, mirrored in TypeScript (FUT-2).
 *
 * These types are NOT ours to design — they are the serde shape of Spacelab's
 * Rust document (`crates/core-scene/src/lib.rs`, `crates/wasm-bindings/src/lib.rs`
 * in mHaines9219/spacelab), which `Document.load_json` parses. Every field name
 * and every enum spelling below was verified by round-tripping the real structs
 * through `serde_json` — glam's `Vec2`/`Vec3` serialize as bare arrays, and the
 * fieldless enums as their variant names:
 *
 *   {"walls":[{"id":0,"start":[0.0,4.0],"end":[0.0,0.0],"thickness":0.12,
 *              "height":2.5,"origin":"Generated"}],
 *    "openings":[],
 *    "furnishings":[{"id":1,"asset":{"extent":[1.0,0.8,0.6],"asset_id":"…"},
 *                    "placement":{"position":[0.4,0.0,0.8],"yaw":0.0,
 *                                 "anchor":"Floor"},
 *                    "scale":[1.0,1.0,1.0],"stashed":false}],
 *    "floor_material":"WoodLight","wall_material":"WarmWhite","lighting":"Noon",
 *    "floor_outline":[[0.0,0.0],[5.0,0.0],[5.0,4.0],[0.0,4.0]]}
 *
 * Every struct there is `#[serde(default)]`, so an omitted field is not an
 * error — but writing the full shape keeps the file diffable against a room
 * Spacelab itself exported.
 *
 * If Spacelab bumps SAVE_VERSION, a newer file is REFUSED by older builds
 * (`LoadError::Version`), so we pin the version we know rather than guessing
 * forward.
 */

/** `[x, z]` in metres — glam `Vec2` on the ground plane. */
export type Vec2 = [number, number];
/** `[x, up, z]` in metres — glam `Vec3`. */
export type Vec3 = [number, number, number];

/** Spacelab's `SAVE_VERSION`. Bump only when Spacelab does. */
export const SAVE_VERSION = 1;

/** Defaults for generated walls, from wasm-bindings' WALL_HEIGHT/WALL_THICKNESS. */
export const WALL_HEIGHT_M = 2.5;
export const WALL_THICKNESS_M = 0.12;

export type WallOrigin = 'Generated' | 'Drawn';
export type FloorMaterial = 'WoodLight' | 'WoodDark' | 'Tile' | 'Concrete';
export type WallMaterial = 'WarmWhite' | 'CoolGrey' | 'Greige' | 'Sage' | 'Clay';
export type LightingPreset = 'Noon' | 'Morning' | 'Evening' | 'Overcast';

/** `Anchor::Floor` | `Anchor::AgainstWall(WallId)` — externally tagged by serde. */
export type Anchor = 'Floor' | { AgainstWall: number };

export type Wall = {
  id: number;
  start: Vec2;
  end: Vec2;
  thickness: number;
  height: number;
  origin: WallOrigin;
};

export type Opening = {
  id: number;
  wall: number;
  kind: 'Door' | 'Window';
  along: number;
  width: number;
  height: number;
  sill: number;
};

export type Placement = { position: Vec3; yaw: number; anchor: Anchor };

/** `extent` is width/height/depth in metres, local `+Z` is the asset's front. */
export type Asset = { extent: Vec3; asset_id: string };

export type Furnishing = {
  id: number;
  asset: Asset;
  placement: Placement;
  /** Per-axis multiplier on `asset.extent`. `[1,1,1]` is catalog size. */
  scale: Vec3;
  /** Held in the bullpen rather than placed on the floor. */
  stashed: boolean;
};

export type Scene = {
  walls: Wall[];
  openings: Opening[];
  furnishings: Furnishing[];
  floor_material: FloorMaterial;
  wall_material: WallMaterial;
  lighting: LightingPreset;
  floor_outline: Vec2[];
};

/**
 * Id allocators ride the save file. They are NOT decoration: Spacelab hands the
 * next placement `next_ids.furnishing`, so a file that understates it makes the
 * user's first drop collide with one of ours.
 */
export type NextIds = { wall: number; opening: number; furnishing: number };

export type SaveFile = { version: number; scene: Scene; next_ids: NextIds };

/**
 * One entry of Spacelab's `catalog.json` (`CatalogEntry` in web/src/viewport.ts).
 * Spacelab resolves `blob` as `/assets/${blob}` today; publishing absolute URLs
 * needs the one-line loader change spec'd in docs/spacelab-integration.md.
 */
export type SpacelabCatalogEntry = {
  asset_id: string;
  title: string;
  category: string | null;
  tags: string[];
  dims_m: { w: number; h: number; d: number };
  blob: string;
  /** Fields beyond the renderer's minimum, matching Spacelab's own catalog. */
  source?: string;
  source_url?: string | null;
  license?: string | null;
  attribution?: string | null;
  style?: string | null;
  anchor?: 'floor' | 'wall';
  front?: '+Z' | '-Z' | '+X' | '-X';
  verified?: boolean;
};
