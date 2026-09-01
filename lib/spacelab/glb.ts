/**
 * A minimal binary-glTF writer: one box, optionally wearing the item's photo.
 *
 * WHY THIS EXISTS. The real pipeline sends an item's photo to an image-to-3D
 * service (Meshy/Tripo/TRELLIS-class) and gets a mesh back. That needs a key and
 * costs money per item, so it cannot be the demo path — but a placeholder that
 * fails to load is worse than no placeholder, because the failure only shows up
 * inside someone else's app. So the mock provider emits a REAL GLB: a correctly
 * sized box with the listing photo mapped onto its faces, which Spacelab's
 * GLTFLoader loads like any other model. Writing ~120 lines of glTF beats
 * pulling a mesh library in for one primitive.
 *
 * MODEL CONTRACT (matters for the real adapter too, not just the mock).
 * Spacelab adds the GLB to the furnishing group untransformed — the group's
 * scale is Rust's per-axis multiplier, `[1,1,1]` on a fresh placement, and the
 * selection box is drawn from the catalog's `dims_m` centred at `y = h/2`
 * (`buildFurnishing`, web/src/viewport.ts). So a model must be authored:
 *   - in METRES at real-world size, matching its catalog `dims_m`
 *   - origin at the CENTRE of its footprint, base on the floor plane (y = 0)
 *   - facing local `+Z` (the catalog's `front`)
 * Any adapter that returns a mesh normalized some other way must re-origin and
 * re-scale it before publishing, or every piece floats or sinks.
 */

const MAGIC = 0x46546c47; // "glTF"
const VERSION = 2;
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const BIN_CHUNK = 0x004e4942; // "BIN\0"

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** Image formats glTF 2.0 core allows. A webp/avif source gets no texture. */
export const TEXTURE_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export type TextureMimeType = (typeof TEXTURE_MIME_TYPES)[number];

export function isTextureMimeType(mime: string): mime is TextureMimeType {
  return (TEXTURE_MIME_TYPES as readonly string[]).includes(mime);
}

export type BoxGlbOptions = {
  /** Real-world size in metres. */
  dims: { w: number; h: number; d: number };
  /** Node/mesh name — shows up in any glTF inspector. */
  name?: string;
  /** The listing photo, mapped onto every face. Omitted → flat grey. */
  texture?: { bytes: Uint8Array; mimeType: TextureMimeType };
};

/**
 * Build a GLB for one item. Deterministic: same dims + same photo bytes in,
 * byte-identical file out, which is what lets the fallback store regenerate a
 * model on request instead of persisting it.
 */
export function buildBoxGlb(opts: BoxGlbOptions): Uint8Array {
  const { positions, normals, uvs, indices, min, max } = boxGeometry(opts.dims);

  const bin = new ByteWriter();
  const bufferViews: Record<string, unknown>[] = [];

  const posView = bufferViews.push(bin.writeFloats(positions, ARRAY_BUFFER)) - 1;
  const normalView = bufferViews.push(bin.writeFloats(normals, ARRAY_BUFFER)) - 1;
  const uvView = bufferViews.push(bin.writeFloats(uvs, ARRAY_BUFFER)) - 1;
  const indexView = bufferViews.push(bin.writeUShorts(indices, ELEMENT_ARRAY_BUFFER)) - 1;
  const imageView = opts.texture ? bufferViews.push(bin.writeBytes(opts.texture.bytes)) - 1 : -1;

  const gltf: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'prop-haus/spacelab mock image-to-3D' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: opts.name ?? 'item' }],
    meshes: [
      {
        name: opts.name ?? 'item',
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
            mode: 4, // TRIANGLES
          },
        ],
      },
    ],
    accessors: [
      { bufferView: posView, componentType: FLOAT, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: normalView, componentType: FLOAT, count: normals.length / 3, type: 'VEC3' },
      { bufferView: uvView, componentType: FLOAT, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: indexView, componentType: UNSIGNED_SHORT, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
    materials: [
      {
        name: 'item',
        pbrMetallicRoughness: {
          ...(opts.texture
            ? { baseColorTexture: { index: 0 } }
            : { baseColorFactor: [0.72, 0.71, 0.69, 1] }),
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
      },
    ],
  };

  if (opts.texture) {
    gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
    gltf.images = [{ bufferView: imageView, mimeType: opts.texture.mimeType }];
    gltf.textures = [{ sampler: 0, source: 0 }];
  }

  return container(JSON.stringify(gltf), bin.bytes());
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * 24 vertices — four per face, so each face carries its own flat normal and a
 * full copy of the photo. A shared-corner cube would smear the normals and give
 * the texture nowhere to sit.
 */
function boxGeometry(dims: { w: number; h: number; d: number }) {
  const hw = dims.w / 2;
  const hd = dims.d / 2;
  const h = dims.h;

  // Each face: four corners counter-clockwise seen from outside (glTF's front
  // winding), starting bottom-left, plus that face's outward normal.
  const faces: { verts: [number, number, number][]; normal: [number, number, number] }[] = [
    { // +Z front — the face the photo reads from
      verts: [[-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd]],
      normal: [0, 0, 1],
    },
    { // -Z back
      verts: [[hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd]],
      normal: [0, 0, -1],
    },
    { // +X right
      verts: [[hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd]],
      normal: [1, 0, 0],
    },
    { // -X left
      verts: [[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd]],
      normal: [-1, 0, 0],
    },
    { // +Y top
      verts: [[-hw, h, hd], [hw, h, hd], [hw, h, -hd], [-hw, h, -hd]],
      normal: [0, 1, 0],
    },
    { // -Y bottom
      verts: [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]],
      normal: [0, -1, 0],
    },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  faces.forEach((face, faceIndex) => {
    for (const v of face.verts) {
      positions.push(v[0], v[1], v[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    // glTF UV origin is top-left, so the bottom of the face is v = 1.
    uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    const base = faceIndex * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  return {
    positions,
    normals,
    uvs,
    indices,
    min: [-hw, 0, -hd],
    max: [hw, h, hd],
  };
}

// ---------------------------------------------------------------------------
// Binary plumbing
// ---------------------------------------------------------------------------

/** Accumulates the BIN chunk, handing back a bufferView per write. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  writeFloats(values: number[], target?: number) {
    const buf = new ArrayBuffer(values.length * 4);
    const view = new DataView(buf);
    values.forEach((v, i) => view.setFloat32(i * 4, v, true));
    return this.push(new Uint8Array(buf), target);
  }

  writeUShorts(values: number[], target?: number) {
    const buf = new ArrayBuffer(values.length * 2);
    const view = new DataView(buf);
    values.forEach((v, i) => view.setUint16(i * 2, v, true));
    return this.push(new Uint8Array(buf), target);
  }

  writeBytes(bytes: Uint8Array) {
    return this.push(bytes);
  }

  /**
   * Append `bytes` and describe them as a bufferView. Every view starts on a
   * 4-byte boundary: glTF requires it for typed accessors, and it costs at most
   * three bytes for the image.
   */
  private push(bytes: Uint8Array, target?: number) {
    this.pad(4);
    const byteOffset = this.length;
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
    return {
      buffer: 0,
      byteOffset,
      byteLength: bytes.byteLength,
      ...(target ? { target } : {}),
    };
  }

  private pad(alignment: number) {
    const over = this.length % alignment;
    if (over === 0) return;
    const fill = new Uint8Array(alignment - over);
    this.chunks.push(fill);
    this.length += fill.byteLength;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
}

/** Wrap the JSON and BIN chunks in the 12-byte GLB header. */
function container(json: string, bin: Uint8Array): Uint8Array {
  const jsonBytes = pad(new TextEncoder().encode(json), 0x20); // spaces
  const binBytes = pad(bin, 0x00);

  const total = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  out.set(jsonBytes, 20);

  const binHeader = 20 + jsonBytes.byteLength;
  view.setUint32(binHeader, binBytes.byteLength, true);
  view.setUint32(binHeader + 4, BIN_CHUNK, true);
  out.set(binBytes, binHeader + 8);

  return out;
}

function pad(bytes: Uint8Array, fill: number): Uint8Array {
  const over = bytes.byteLength % 4;
  if (over === 0) return bytes;
  const out = new Uint8Array(bytes.byteLength + (4 - over));
  out.set(bytes, 0);
  out.fill(fill, bytes.byteLength);
  return out;
}
