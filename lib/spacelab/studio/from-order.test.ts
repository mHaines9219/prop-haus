import { describe, expect, it, vi } from 'vitest';
import { vendorNameFor } from '../asset';
import type { ModelSeed } from '../models';
import { applyCommands } from './scene';
import { sceneForOrder, sceneFromSeeds } from './from-order';

vi.mock('@/lib/orders', () => ({ getOrderById: vi.fn() }));
vi.mock('../handoff', () => ({ seedsForOrder: vi.fn() }));

const seed = (over: Partial<ModelSeed>): ModelSeed => ({
  assetId: 'prophaus:newel:1',
  source: 'newel',
  sourceId: '1',
  title: 'Sofa',
  spacelabCategory: 'seating',
  tags: [],
  dims: { w: 2.1, d: 0.9, h: 0.8 },
  dimsSource: 'vendor',
  ...over,
});

describe('sceneFromSeeds', () => {
  it('converts metres to feet and stages pieces in a row along the back wall', () => {
    const scene = sceneFromSeeds([
      seed({}),
      seed({ assetId: 'prophaus:eclectic:2', source: 'eclectic', title: 'Lamp', dims: { w: 0.3, d: 0.3, h: 1.6 } }),
    ]);
    expect(scene.items.map((i) => i.id)).toEqual(['prophaus:newel:1', 'prophaus:eclectic:2']);
    expect(scene.items[0].size).toEqual({ w: 6.9, d: 3, h: 2.6 });
    expect(scene.items[1].vendor).toBe(vendorNameFor('eclectic'));
    expect(scene.room).toEqual({ width: 12, depth: 13, height: 10 });
    expect(scene.placements['prophaus:newel:1']).toEqual({ x: 4.5, z: 2.5, rotation: 0 });
    expect(scene.placements['prophaus:eclectic:2']).toEqual({ x: 9.4, z: 1.5, rotation: 0 });
  });

  it('wraps into a second row and grows the room for a big set', () => {
    const seeds = Array.from({ length: 8 }, (_, i) =>
      seed({ assetId: `prophaus:newel:${i}`, title: `Piece ${i}`, dims: { w: 1.5, d: 1, h: 1 } }),
    );
    const scene = sceneFromSeeds(seeds);
    expect(scene.room.width).toBeGreaterThan(12);
    const rows = new Set(Object.values(scene.placements).map((p) => p.z));
    expect(rows.size).toBe(2);
    expect(Object.keys(scene.placements)).toHaveLength(8);
  });

  it('makes a scene the reducer accepts as is', () => {
    const scene = sceneFromSeeds([seed({})]);
    expect(applyCommands(scene, [{ type: 'move', itemId: 'prophaus:newel:1', x: 6, z: 6 }]).rejected).toEqual([]);
  });

  it('gives an empty order an empty room', () => {
    expect(sceneFromSeeds([])).toEqual({ room: { width: 12, depth: 10, height: 10 }, items: [], placements: {} });
  });
});

describe('sceneForOrder', () => {
  it('loads the order for the org and seeds it', async () => {
    const { getOrderById } = await import('@/lib/orders');
    const { seedsForOrder } = await import('../handoff');
    vi.mocked(getOrderById).mockResolvedValue({ id: 'o1' } as never);
    vi.mocked(seedsForOrder).mockResolvedValue([seed({})]);
    const scene = await sceneForOrder('o1', 'org-1');
    expect(getOrderById).toHaveBeenCalledWith('o1', 'org-1');
    expect(scene.items[0].name).toBe('Sofa');
  });
});
