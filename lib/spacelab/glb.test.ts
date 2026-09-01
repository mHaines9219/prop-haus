import { describe, expect, it } from 'vitest';
import { buildBoxGlb, isTextureMimeType } from './glb';

/** Parse a GLB back into its header, JSON chunk and BIN chunk. */
function parse(glb: Uint8Array) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const total = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  const binType = view.getUint32(binHeader + 4, true);
  const bin = glb.subarray(binHeader + 8, binHeader + 8 + binLength);
  return { magic, version, total, jsonLength, jsonType, json, binLength, binType, bin };
}

const DIMS = { w: 1.8, h: 0.8, d: 0.9 };

describe('buildBoxGlb', () => {
  it('writes a well-formed GLB container', () => {
    const glb = buildBoxGlb({ dims: DIMS, name: 'couch' });
    const g = parse(glb);

    expect(g.magic).toBe(0x46546c47); // "glTF"
    expect(g.version).toBe(2);
    expect(g.total).toBe(glb.byteLength);
    expect(g.jsonType).toBe(0x4e4f534a);
    expect(g.binType).toBe(0x004e4942);
    // Both chunks are 4-byte aligned, and the two of them plus both headers
    // account for the whole file.
    expect(g.jsonLength % 4).toBe(0);
    expect(g.binLength % 4).toBe(0);
    expect(12 + 8 + g.jsonLength + 8 + g.binLength).toBe(glb.byteLength);
  });

  it('describes a 24-vertex box whose accessors fit inside the buffer', () => {
    const { json, binLength } = parse(buildBoxGlb({ dims: DIMS }));

    const [position, normal, uv, index] = json.accessors;
    expect(position.count).toBe(24);
    expect(normal.count).toBe(24);
    expect(uv.count).toBe(24);
    expect(index.count).toBe(36); // 6 faces × 2 triangles × 3

    for (const viewDef of json.bufferViews) {
      expect(viewDef.byteOffset % 4).toBe(0); // typed accessors need alignment
      expect(viewDef.byteOffset + viewDef.byteLength).toBeLessThanOrEqual(binLength);
    }
    expect(json.buffers[0].byteLength).toBe(binLength);
  });

  it('sits the box on the floor plane, centred on its footprint', () => {
    // The model contract Spacelab renders against: y starts at 0 (the piece
    // stands on the floor rather than straddling it) and x/z are centred.
    const { json } = parse(buildBoxGlb({ dims: DIMS }));
    const [position] = json.accessors;

    expect(position.min).toEqual([-DIMS.w / 2, 0, -DIMS.d / 2]);
    expect(position.max).toEqual([DIMS.w / 2, DIMS.h, DIMS.d / 2]);
  });

  it('is untextured, and flat grey, when no photo is supplied', () => {
    const { json } = parse(buildBoxGlb({ dims: DIMS }));
    expect(json.images).toBeUndefined();
    expect(json.textures).toBeUndefined();
    expect(json.materials[0].pbrMetallicRoughness.baseColorFactor).toHaveLength(4);
  });

  it('embeds a supplied photo as the base colour texture', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]); // JPEG-ish
    const { json, bin } = parse(
      buildBoxGlb({ dims: DIMS, texture: { bytes, mimeType: 'image/jpeg' } }),
    );

    expect(json.images).toHaveLength(1);
    expect(json.images[0].mimeType).toBe('image/jpeg');
    expect(json.materials[0].pbrMetallicRoughness.baseColorTexture).toEqual({ index: 0 });

    // The image bytes survive the write, byte for byte, at the offset the
    // bufferView claims.
    const imageView = json.bufferViews[json.images[0].bufferView];
    expect([...bin.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength)])
      .toEqual([...bytes]);
  });

  it('is deterministic — the same item regenerates byte-identically', () => {
    // The fallback model store leans on this: it re-derives a GLB per request
    // instead of persisting one, and callers may cache it by URL.
    const a = buildBoxGlb({ dims: DIMS, name: 'couch' });
    const b = buildBoxGlb({ dims: DIMS, name: 'couch' });
    expect([...a]).toEqual([...b]);
  });
});

describe('isTextureMimeType', () => {
  it('accepts what glTF 2.0 core accepts, and nothing else', () => {
    expect(isTextureMimeType('image/jpeg')).toBe(true);
    expect(isTextureMimeType('image/png')).toBe(true);
    // Rendering these needs an extension Spacelab does not load.
    expect(isTextureMimeType('image/webp')).toBe(false);
    expect(isTextureMimeType('image/avif')).toBe(false);
  });
});
