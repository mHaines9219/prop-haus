import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';

/**
 * The local vector index: the text each item embeds as, the cosine/top-k
 * math on vectors small enough to check by hand, and the file layer (missing
 * files read as no index, the cache, and the tmp-then-rename write).
 */

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn<(file: string, encoding?: string) => Promise<string | Buffer>>(),
  writeFile: vi.fn<(file: string, data: unknown, encoding?: string) => Promise<void>>(),
  rename: vi.fn<(from: string, to: string) => Promise<void>>(),
}));
vi.mock('node:fs', () => ({ promises: fsMock }));

const IDS_FILE = path.join(process.cwd(), 'data', 'embeddings.ids.json');
const VECTORS_FILE = path.join(process.cwd(), 'data', 'embeddings.f32');

async function load(): Promise<typeof import('./embeddings')> {
  vi.resetModules();
  return import('./embeddings');
}

function filesPresent(ids: string[], vectors: Float32Array) {
  fsMock.readFile.mockImplementation(async (file) =>
    file === IDS_FILE ? JSON.stringify(ids) : Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength),
  );
}

beforeEach(() => {
  fsMock.readFile.mockReset();
  fsMock.writeFile.mockReset().mockResolvedValue(undefined);
  fsMock.rename.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('constants', () => {
  it('pins the embedding model and its dimension', async () => {
    const { EMBED_DIM, EMBED_MODEL } = await load();
    expect(EMBED_DIM).toBe(1536);
    expect(EMBED_MODEL).toBe('text-embedding-3-small');
  });
});

describe('canonicalText', () => {
  it('joins name, category/subcategory and every enrichment field with pipes', async () => {
    const { canonicalText } = await load();
    const item = makePropItem({
      name: 'Credenza',
      category: 'storage',
      subcategory: 'credenzas',
      description: 'Long and low.',
      style: ['mcm'],
      era: '1960s',
      materials: ['walnut', 'brass'],
      colors: ['brown'],
      vibes: ['warm'],
      settingType: ['office'],
      genreFit: ['period-drama'],
      tags: ['sideboard'],
    });
    expect(canonicalText(item)).toBe(
      'Credenza | storage/credenzas | Long and low. | mcm | 1960s | walnut, brass | brown | warm | office | period-drama | sideboard',
    );
  });

  it('skips empty parts and the subcategory slash when absent', async () => {
    const { canonicalText } = await load();
    const item = makePropItem({
      name: 'Credenza',
      category: 'storage',
      subcategory: undefined,
      description: undefined,
      style: [],
      era: undefined,
      materials: undefined,
      colors: undefined,
      vibes: undefined,
      settingType: undefined,
      genreFit: undefined,
      tags: undefined,
    });
    expect(canonicalText(item)).toBe('Credenza | storage');
  });
});

describe('cosine', () => {
  it('is 1 for parallel, 0 for orthogonal and -1 for opposite vectors', async () => {
    const { cosine } = await load();
    const a = new Float32Array([1, 0]);
    expect(cosine(a, new Float32Array([2, 0]), 0, 0, 2)).toBeCloseTo(1, 6);
    expect(cosine(a, new Float32Array([0, 3]), 0, 0, 2)).toBeCloseTo(0, 6);
    expect(cosine(a, new Float32Array([-1, 0]), 0, 0, 2)).toBeCloseTo(-1, 6);
  });

  it('reads from the given offsets inside packed arrays', async () => {
    const { cosine } = await load();
    const packed = new Float32Array([9, 9, 1, 0, 0, 1]);
    const query = new Float32Array([5, 0, 1]);
    expect(cosine(packed, query, 2, 1, 2)).toBeCloseTo(0, 6);
    expect(cosine(packed, query, 4, 1, 2)).toBeCloseTo(1, 6);
  });

  it('does not divide by zero on a zero vector', async () => {
    const { cosine } = await load();
    expect(cosine(new Float32Array([0, 0]), new Float32Array([1, 1]), 0, 0, 2)).toBe(0);
  });
});

describe('topK', () => {
  const index = {
    ids: ['east', 'north', 'diag', 'west'],
    vectors: new Float32Array([1, 0, 0, 1, 1, 1, -1, 0]),
    dim: 2,
  };

  it('ranks every id by similarity, best first', async () => {
    const { topK } = await load();
    const hits = topK(index, new Float32Array([1, 0]), 4);
    expect(hits.map((h) => h.id)).toEqual(['east', 'diag', 'north', 'west']);
    expect(hits[0].score).toBeCloseTo(1, 6);
    expect(hits[3].score).toBeCloseTo(-1, 6);
  });

  it('truncates to k and tolerates k past the end', async () => {
    const { topK } = await load();
    expect(topK(index, new Float32Array([1, 0]), 2).map((h) => h.id)).toEqual(['east', 'diag']);
    expect(topK(index, new Float32Array([1, 0]), 10)).toHaveLength(4);
    expect(topK(index, new Float32Array([1, 0]), 0)).toEqual([]);
  });

  it('is empty for an empty index', async () => {
    const { topK } = await load();
    expect(topK({ ids: [], vectors: new Float32Array(0), dim: 2 }, new Float32Array([1, 0]), 5)).toEqual([]);
  });
});

describe('loadIndex', () => {
  it('reads ids and packed vectors from data/', async () => {
    filesPresent(['a', 'b'], new Float32Array([1, 0, 0, 1]));
    const { loadIndex, EMBED_DIM } = await load();
    const index = await loadIndex();
    expect(index).not.toBeNull();
    expect(index!.ids).toEqual(['a', 'b']);
    expect([...index!.vectors]).toEqual([1, 0, 0, 1]);
    expect(index!.dim).toBe(EMBED_DIM);
    expect(fsMock.readFile).toHaveBeenCalledWith(IDS_FILE, 'utf8');
    expect(fsMock.readFile).toHaveBeenCalledWith(VECTORS_FILE);
  });

  it('is null when either file is missing', async () => {
    fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
    const { loadIndex } = await load();
    expect(await loadIndex()).toBeNull();
  });

  it('is null when the ids file is not JSON', async () => {
    fsMock.readFile.mockImplementation(async (file) => (file === IDS_FILE ? '{oops' : Buffer.alloc(0)));
    const { loadIndex } = await load();
    expect(await loadIndex()).toBeNull();
  });

  it('caches the index after the first load', async () => {
    filesPresent(['a'], new Float32Array([1]));
    const { loadIndex } = await load();
    const first = await loadIndex();
    expect(await loadIndex()).toBe(first);
    expect(fsMock.readFile).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed load', async () => {
    fsMock.readFile.mockRejectedValueOnce(new Error('ENOENT')).mockRejectedValueOnce(new Error('ENOENT'));
    const { loadIndex } = await load();
    expect(await loadIndex()).toBeNull();
    filesPresent(['a'], new Float32Array([1]));
    expect(await loadIndex()).not.toBeNull();
  });
});

describe('writeIndex', () => {
  it('writes both files to a temp name, then renames, then drops the cache', async () => {
    filesPresent(['old'], new Float32Array([1]));
    const { loadIndex, writeIndex } = await load();
    await loadIndex();

    const vectors = new Float32Array([0.5, 0.25]);
    await writeIndex(['x', 'y'], vectors);

    expect(fsMock.writeFile.mock.calls[0]).toEqual([`${IDS_FILE}.tmp`, '["x","y"]', 'utf8']);
    const [vecPath, vecData] = fsMock.writeFile.mock.calls[1];
    expect(vecPath).toBe(`${VECTORS_FILE}.tmp`);
    expect(Buffer.isBuffer(vecData)).toBe(true);
    expect((vecData as Buffer).byteLength).toBe(8);
    expect(fsMock.rename.mock.calls).toEqual([
      [`${IDS_FILE}.tmp`, IDS_FILE],
      [`${VECTORS_FILE}.tmp`, VECTORS_FILE],
    ]);

    filesPresent(['x', 'y'], vectors);
    expect((await loadIndex())!.ids).toEqual(['x', 'y']);
  });

  it('never renames when a write fails', async () => {
    fsMock.writeFile.mockRejectedValueOnce(new Error('ENOSPC'));
    const { writeIndex } = await load();
    await expect(writeIndex(['x'], new Float32Array([1]))).rejects.toThrow('ENOSPC');
    expect(fsMock.rename).not.toHaveBeenCalled();
  });
});
