import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';

/**
 * The embedding shortlist: one OpenRouter call to embed the query, then the
 * local index and catalog. Covers the guards (no key, no index, bad or
 * wrong-sized embedding) and the text form the reranker reads.
 */

vi.mock('./embeddings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embeddings')>()),
  loadIndex: vi.fn(),
  topK: vi.fn(),
}));
vi.mock('./catalog', () => ({ loadCatalog: vi.fn(async () => []) }));

import { EMBED_DIM, loadIndex, topK } from './embeddings';
import { loadCatalog } from './catalog';
import { shortlistAsText, shortlistByEmbedding } from './search-index';

const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';

const A = makePropItem({ sourceId: 'a' });
const B = makePropItem({ sourceId: 'b' });
const index = { ids: ['omega-a', 'omega-b'], vectors: new Float32Array(0), dim: EMBED_DIM };

const fetchMock = vi.fn<typeof fetch>();

function embedReply(embedding: number[] | undefined) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: embedding ? [{ embedding }] : [] }), { status: 200 }),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENROUTER_API_KEY', 'or-key');
  fetchMock.mockReset();
  vi.mocked(loadIndex).mockReset().mockResolvedValue(index);
  vi.mocked(topK).mockReset().mockReturnValue([]);
  vi.mocked(loadCatalog).mockReset().mockResolvedValue([A, B]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('shortlistByEmbedding', () => {
  it('refuses without an API key, before touching the index', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(shortlistByEmbedding('lamp')).rejects.toThrow('OPENROUTER_API_KEY is not set');
    expect(loadIndex).not.toHaveBeenCalled();
  });

  it('is empty without an index and never calls out', async () => {
    vi.mocked(loadIndex).mockResolvedValue(null);
    expect(await shortlistByEmbedding('lamp')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('embeds the query, runs topK and hydrates hits from the catalog', async () => {
    embedReply(Array(EMBED_DIM).fill(0.1));
    vi.mocked(topK).mockReturnValue([
      { id: 'omega-b', score: 0.9 },
      { id: 'omega-a', score: 0.8 },
    ]);

    const out = await shortlistByEmbedding('lamp', 7);

    expect(out).toEqual([
      { item: B, score: 0.9 },
      { item: A, score: 0.8 },
    ]);
    const [idx, vec, k] = vi.mocked(topK).mock.calls[0];
    expect(idx).toBe(index);
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec).toHaveLength(EMBED_DIM);
    expect(k).toBe(7);
  });

  it('defaults k to 50', async () => {
    embedReply(Array(EMBED_DIM).fill(0));
    await shortlistByEmbedding('lamp');
    expect(vi.mocked(topK).mock.calls[0][2]).toBe(50);
  });

  it('sends the model, the query and the key', async () => {
    embedReply(Array(EMBED_DIM).fill(0));
    await shortlistByEmbedding('brass lamp');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer or-key');
    expect(JSON.parse(init!.body as string)).toEqual({ model: EMBED_MODEL, input: 'brass lamp' });
  });

  it('drops hits whose id is no longer in the catalog', async () => {
    embedReply(Array(EMBED_DIM).fill(0));
    vi.mocked(topK).mockReturnValue([
      { id: 'omega-gone', score: 0.99 },
      { id: 'omega-a', score: 0.5 },
    ]);
    expect(await shortlistByEmbedding('x')).toEqual([{ item: A, score: 0.5 }]);
  });

  it('throws on an error status with the body excerpt', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 402 }));
    await expect(shortlistByEmbedding('x')).rejects.toThrow('OpenRouter embed 402: quota exceeded');
  });

  it('throws when no embedding comes back', async () => {
    embedReply(undefined);
    await expect(shortlistByEmbedding('x')).rejects.toThrow('no embedding returned');
  });

  it('throws when the embedding has the wrong dimension', async () => {
    embedReply([0.1, 0.2, 0.3]);
    await expect(shortlistByEmbedding('x')).rejects.toThrow(`embedding dim 3 != ${EMBED_DIM}`);
  });
});

describe('shortlistAsText', () => {
  it('renders one line per item with category, tags and a clipped description', () => {
    const item = makePropItem({
      sourceId: 'a',
      name: 'Credenza',
      description: 'x'.repeat(200),
      style: ['mcm', 'danish'],
      era: '1960s',
      materials: ['walnut'],
      colors: ['brown'],
    });
    const line = shortlistAsText([{ item, score: 1 }]);
    expect(line).toBe(
      `omega-a | storage-credenzas/credenzas | Credenza [mcm,danish | 1960s | walnut | brown] — ${'x'.repeat(140)}`,
    );
  });

  it('omits the subcategory, tags and description when absent', () => {
    const item = makePropItem({
      sourceId: 'a',
      name: 'Credenza',
      subcategory: undefined,
      description: undefined,
      style: undefined,
      era: undefined,
      materials: [],
      colors: undefined,
    });
    expect(shortlistAsText([{ item, score: 1 }])).toBe('omega-a | storage-credenzas | Credenza');
  });

  it('joins items with newlines and is empty for an empty list', () => {
    expect(shortlistAsText([])).toBe('');
    expect(shortlistAsText([{ item: A, score: 1 }, { item: B, score: 1 }]).split('\n')).toHaveLength(2);
  });
});
