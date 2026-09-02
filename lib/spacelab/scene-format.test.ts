import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, WALL_HEIGHT_M, WALL_THICKNESS_M } from './scene-format';

/**
 * These numbers are Spacelab's, not ours: a different SAVE_VERSION is refused
 * by its loader, and the wall defaults mirror its wasm bindings. Pinning them
 * makes a silent bump a visible diff.
 */

describe('scene-format constants', () => {
  it('pins the save version Spacelab accepts', () => {
    expect(SAVE_VERSION).toBe(1);
  });

  it('pins the generated-wall defaults in metres', () => {
    expect(WALL_HEIGHT_M).toBe(2.5);
    expect(WALL_THICKNESS_M).toBe(0.12);
  });
});
