import { describe, expect, it } from 'vitest';
import { anchorPosition, applyCommands, footprint, placeholderScene, SceneCommandSchema } from './scene';

describe('applyCommands', () => {
  const scene = placeholderScene();

  it('places an item and clamps it inside the room', () => {
    const { scene: next, rejected } = applyCommands(scene, [{ type: 'place', itemId: 'armchair', x: 100, z: -5 }]);
    expect(rejected).toEqual([]);
    expect(next.placements.armchair).toEqual({ x: 18 - 1.4, z: 1.4, rotation: 0 });
    expect(scene.placements.armchair).toBeUndefined();
  });

  it('moves, rotates and removes a placed item', () => {
    const { scene: next } = applyCommands(scene, [
      { type: 'move', itemId: 'sofa', x: 4, z: 6 },
      { type: 'rotate', itemId: 'sofa', rotation: 90 },
      { type: 'remove', itemId: 'lamp' },
    ]);
    expect(next.placements.sofa).toEqual({ x: 4, z: 6, rotation: 90 });
    expect(next.placements.lamp).toBeUndefined();
  });

  it('rejects commands for unknown or unplaced items and keeps going', () => {
    const { scene: next, rejected } = applyCommands(scene, [
      { type: 'move', itemId: 'ghost', x: 1, z: 1 },
      { type: 'move', itemId: 'ficus', x: 1, z: 1 },
      { type: 'move', itemId: 'lamp', x: 2, z: 2 },
    ]);
    expect(rejected.map((r) => r.reason)).toEqual(['no item "ghost"', '"Ficus, 6 ft" is not in the room']);
    expect(next.placements.lamp).toEqual({ x: 2, z: 2, rotation: 0 });
  });

  it('resizes the room and pulls placed items back inside', () => {
    const { scene: next } = applyCommands(scene, [{ type: 'resize_room', width: 8, depth: 8 }]);
    expect(next.room).toEqual({ width: 8, depth: 8, height: 9 });
    expect(next.placements.sofa.x).toBe(4.5);
    expect(next.placements['coffee-table'].z).toBe(5);
  });

  it('rejects an absurd room size', () => {
    const { rejected } = applyCommands(scene, [{ type: 'resize_room', width: 1, depth: 500 }]);
    expect(rejected[0]?.reason).toBe('room size out of range');
  });
});

describe('footprint and anchors', () => {
  it('swaps width and depth at a quarter turn', () => {
    const sofa = placeholderScene().items[0];
    expect(footprint(sofa, 0)).toEqual({ w: 7, d: 3 });
    expect(footprint(sofa, 90)).toEqual({ w: 3, d: 7 });
    expect(footprint(sofa, -90)).toEqual({ w: 3, d: 7 });
  });

  it('puts the back anchor flush against the back wall', () => {
    expect(anchorPosition({ width: 18, depth: 12, height: 9 }, { w: 7, d: 3 }, 'back')).toEqual({ x: 9, z: 1.5 });
    expect(anchorPosition({ width: 18, depth: 12, height: 9 }, { w: 7, d: 3 }, 'right')).toEqual({ x: 14.5, z: 6 });
  });
});

describe('SceneCommandSchema', () => {
  it('rejects a command with an unknown type', () => {
    expect(SceneCommandSchema.safeParse({ type: 'explode', itemId: 'sofa' }).success).toBe(false);
    expect(SceneCommandSchema.safeParse({ type: 'remove', itemId: 'sofa' }).success).toBe(true);
  });
});
