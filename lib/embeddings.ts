import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PropItem } from './types';

export const EMBED_MODEL = 'text-embedding-3-small';
export const EMBED_DIM = 1536;

const VECTORS_FILE = path.join(process.cwd(), 'data', 'embeddings.f32');
const IDS_FILE = path.join(process.cwd(), 'data', 'embeddings.ids.json');

export function canonicalText(item: PropItem): string {
  const parts = [
    item.name,
    item.category + (item.subcategory ? '/' + item.subcategory : ''),
    item.description ?? '',
    item.style?.join(', ') ?? '',
    item.era ?? '',
    item.materials?.join(', ') ?? '',
    item.colors?.join(', ') ?? '',
    item.vibes?.join(', ') ?? '',
    item.settingType?.join(', ') ?? '',
    item.genreFit?.join(', ') ?? '',
    item.tags?.join(', ') ?? '',
  ];
  return parts.filter(Boolean).join(' | ');
}

export type VectorIndex = {
  ids: string[];
  vectors: Float32Array; // packed: ids.length * EMBED_DIM
  dim: number;
};

let cached: VectorIndex | null = null;

export async function loadIndex(): Promise<VectorIndex | null> {
  if (cached) return cached;
  try {
    const [idsRaw, vecBuf] = await Promise.all([
      fs.readFile(IDS_FILE, 'utf8'),
      fs.readFile(VECTORS_FILE),
    ]);
    const ids = JSON.parse(idsRaw) as string[];
    const vectors = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, vecBuf.byteLength / 4);
    cached = { ids, vectors, dim: EMBED_DIM };
    return cached;
  } catch {
    return null;
  }
}

// Temp file + rename. The vector file is ~550 MB and a crash partway through a
// direct write leaves a truncated index that still loads — loadIndex derives the
// vector count from byteLength, so the result is a silently wrong index rather
// than an error. Rebuilding it costs a full `pnpm embed` run.
export async function writeIndex(ids: string[], vectors: Float32Array) {
  await fs.writeFile(`${IDS_FILE}.tmp`, JSON.stringify(ids), 'utf8');
  await fs.writeFile(
    `${VECTORS_FILE}.tmp`,
    Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength),
  );
  await fs.rename(`${IDS_FILE}.tmp`, IDS_FILE);
  await fs.rename(`${VECTORS_FILE}.tmp`, VECTORS_FILE);
  cached = null;
}

export function cosine(a: Float32Array, b: Float32Array, aOffset: number, bOffset: number, dim: number): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < dim; i++) {
    const x = a[aOffset + i];
    const y = b[bOffset + i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export function topK(index: VectorIndex, query: Float32Array, k: number): Array<{ id: string; score: number }> {
  const { ids, vectors, dim } = index;
  const scored: Array<{ id: string; score: number }> = [];
  for (let i = 0; i < ids.length; i++) {
    const score = cosine(vectors, query, i * dim, 0, dim);
    scored.push({ id: ids[i], score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
