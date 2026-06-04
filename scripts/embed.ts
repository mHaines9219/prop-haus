/**
 * Generate embeddings for every item in data/catalog.json via OpenRouter.
 *
 *   pnpm embed
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';
import { Catalog } from '../lib/types';
import { canonicalText, writeIndex, EMBED_DIM } from '../lib/embeddings';

const DATA = path.join(process.cwd(), 'data');
const BATCH = 64;
const CONCURRENCY = 4;
const MODEL = process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';
const OR_URL = 'https://openrouter.ai/api/v1/embeddings';

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
      'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  if (!data.data) throw new Error('No embedding data in response');
  return data.data.map((d) => d.embedding);
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    process.exit(1);
  }
  const raw = await fs.readFile(path.join(DATA, 'catalog.json'), 'utf8');
  const items = Catalog.parse(JSON.parse(raw));
  console.log(`Embedding ${items.length} items with ${MODEL}`);

  const ids: string[] = new Array(items.length);
  const vectors = new Float32Array(items.length * EMBED_DIM);
  const limit = pLimit(CONCURRENCY);
  let done = 0;

  const batches: Array<{ start: number; texts: string[] }> = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const slice = items.slice(i, i + BATCH);
    batches.push({ start: i, texts: slice.map(canonicalText) });
  }

  await Promise.all(
    batches.map(({ start, texts }) =>
      limit(async () => {
        const vecs = await embedBatch(texts, apiKey);
        if (vecs[0].length !== EMBED_DIM) {
          throw new Error(`embedding dim mismatch: got ${vecs[0].length}, expected ${EMBED_DIM}`);
        }
        for (let j = 0; j < vecs.length; j++) {
          const item = items[start + j];
          ids[start + j] = item.id;
          vectors.set(vecs[j], (start + j) * EMBED_DIM);
        }
        done += texts.length;
        if (done % 512 === 0 || done === items.length) console.log(`  ${done}/${items.length}`);
      }),
    ),
  );

  await writeIndex(ids, vectors);
  console.log(`Wrote data/embeddings.f32 (${ids.length} vectors × ${EMBED_DIM})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
