import { describe, expect, it } from 'vitest';
import { buildScene, type SceneItem } from './scene';
import { SAVE_VERSION, WALL_HEIGHT_M, WALL_THICKNESS_M } from './scene-format';

const item = (assetId: string, w: number, h: number, d: number): SceneItem => ({
  assetId,
  dims: { w, h, d },
});

const SOFA = item('prophaus:ec:sofa-1', 2.2, 0.8, 0.95);
const LAMP = item('prophaus:omega:lamp-9', 0.4, 1.6, 0.4);
const TABLE = item('prophaus:hpr:table-3', 1.2, 0.75, 0.8);

describe('buildScene', () => {
  it('writes the envelope Spacelab load_json expects', () => {
    const file = buildScene([SOFA, LAMP]);

    expect(file.version).toBe(SAVE_VERSION);
    expect(file.scene.openings).toEqual([]);
    expect(file.scene.floor_material).toBe('WoodLight');
    expect(file.scene.wall_material).toBe('WarmWhite');
    expect(file.scene.lighting).toBe('Noon');
  });

  it('raises the two walls set_rectangle raises, over a four-corner floor', () => {
    const { scene } = buildScene([SOFA], { room: { widthM: 6, depthM: 5 } });

    expect(scene.walls).toHaveLength(2);
    // Far-left side then the far edge, exactly as set_rectangle orders them.
    expect(scene.walls[0]).toMatchObject({ id: 0, start: [0, 5], end: [0, 0], origin: 'Generated' });
    expect(scene.walls[1]).toMatchObject({ id: 1, start: [0, 0], end: [6, 0] });
    expect(scene.walls[0].height).toBe(WALL_HEIGHT_M);
    expect(scene.walls[0].thickness).toBe(WALL_THICKNESS_M);
    expect(scene.floor_outline).toEqual([
      [0, 0],
      [6, 0],
      [6, 5],
      [0, 5],
    ]);
  });

  it('carries each item as a furnishing at catalog size', () => {
    const { scene } = buildScene([SOFA, TABLE]);

    expect(scene.furnishings.map((f) => f.asset.asset_id)).toEqual([
      'prophaus:ec:sofa-1',
      'prophaus:hpr:table-3',
    ]);
    expect(scene.furnishings[0].asset.extent).toEqual([2.2, 0.8, 0.95]);
    // scale is a multiplier on extent — the model is already real-world sized.
    expect(scene.furnishings[0].scale).toEqual([1, 1, 1]);
    expect(scene.furnishings[0].placement.anchor).toBe('Floor');
    expect(scene.furnishings[0].placement.yaw).toBe(0);
  });

  it('hands out ids the allocators clear, so the user’s first drop cannot collide', () => {
    const file = buildScene([SOFA, LAMP, TABLE]);

    expect(file.scene.furnishings.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(file.next_ids.furnishing).toBe(4);
    expect(file.next_ids.wall).toBe(2);
    expect(file.next_ids.opening).toBe(0);
  });

  it('steps a row by each piece’s own width, so nothing overlaps its neighbour', () => {
    const { scene } = buildScene([SOFA, TABLE, LAMP], { room: { widthM: 14, depthM: 8 } });

    const spans = scene.furnishings.map((f, i) => {
      const w = f.asset.extent[0];
      const x = f.placement.position[0];
      return { min: x - w / 2, max: x + w / 2, i };
    });
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].min).toBeGreaterThanOrEqual(spans[i - 1].max);
    }
  });

  it('wraps into a second row rather than running through the side wall', () => {
    const many = Array.from({ length: 6 }, (_, i) => item(`prophaus:ec:sofa-${i}`, 2.2, 0.8, 0.95));
    const { scene } = buildScene(many, { room: { widthM: 6, depthM: 10 } });

    const zs = new Set(scene.furnishings.map((f) => f.placement.position[2]));
    expect(zs.size).toBeGreaterThan(1);
    for (const f of scene.furnishings) {
      const halfWidth = f.asset.extent[0] / 2;
      expect(f.placement.position[0] - halfWidth).toBeGreaterThanOrEqual(0);
      expect(f.placement.position[0] + halfWidth).toBeLessThanOrEqual(6);
    }
  });

  it('stashes the overflow in the bullpen instead of stacking it past the far wall', () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`prophaus:ec:sofa-${i}`, 2.2, 0.8, 1.4));
    const { scene } = buildScene(many, { room: { widthM: 5, depthM: 4 } });

    // Nothing is dropped: every ordered item is in the document either way.
    expect(scene.furnishings).toHaveLength(40);
    expect(scene.furnishings.some((f) => f.stashed)).toBe(true);
    expect(scene.furnishings.some((f) => !f.stashed)).toBe(true);
  });

  it('sizes the room to the set when no room is given', () => {
    const small = buildScene([LAMP]);
    const big = buildScene(Array.from({ length: 12 }, (_, i) => item(`a${i}`, 2.2, 0.8, 1.1)));

    const widthOf = (f: ReturnType<typeof buildScene>) =>
      Math.max(...f.scene.floor_outline.map((p) => p[0]));

    expect(widthOf(small)).toBe(5); // floor of MIN_ROOM_M
    expect(widthOf(big)).toBeGreaterThan(widthOf(small));
    expect(widthOf(big)).toBeLessThanOrEqual(14); // ceiling of MAX_ROOM_M
  });

  it('produces an empty but valid room for an order with nothing in it', () => {
    const file = buildScene([]);
    expect(file.scene.furnishings).toEqual([]);
    expect(file.scene.walls).toHaveLength(2);
    expect(file.next_ids.furnishing).toBe(1);
  });
});
