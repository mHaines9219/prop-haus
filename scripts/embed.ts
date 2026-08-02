/**
 * Generate embeddings for data/catalog.json via OpenRouter.
 *
 *   pnpm embed          # only items whose canonicalText changed since last run
 *   pnpm embed --all    # re-embed everything, ignoring the previous index
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pLimit from 'p-limit';
import { parseCatalogItemsStrict } from '../lib/catalog-parse';
import { canonicalText, loadIndex, writeIndex, EMBED_DIM } from '../lib/embeddings';

const DATA = path.join(process.cwd(), 'data');
const META_FILE = path.join(DATA, 'embeddings.meta.json');
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

/**
 * id -> sha1(canonicalText) at the time that id's vector was built. Absent on a
 * first run, in which case every item is treated as stale.
 */
type Meta = Record<string, string>;

async function readMeta(): Promise<Meta> {
  try {
    return JSON.parse(await fs.readFile(META_FILE, 'utf8')) as Meta;
  } catch {
    return {};
  }
}

async function writeMeta(meta: Meta) {
  await fs.writeFile(`${META_FILE}.tmp`, JSON.stringify(meta), 'utf8');
  await fs.rename(`${META_FILE}.tmp`, META_FILE);
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    process.exit(1);
  }
  const all = process.argv.includes('--all');
  const raw = await fs.readFile(path.join(DATA, 'catalog.json'), 'utf8');
  const items = parseCatalogItemsStrict(JSON.parse(raw), 'embed');

  // Incremental resume. A vector is reusable only if the text it was built from
  // is the text we'd send today, so reuse is keyed on a hash of canonicalText
  // rather than on the id. Without this, `pnpm enrich` on one vendor forced a
  // full 90k re-embed — and skipping the re-embed instead left the enriched
  // items retrievable only by their old, pre-enrichment text.
  //
  // MODEL is in the hash, not just the text. A vector is only reusable if the
  // *same model* produced it: change OPENROUTER_EMBED_MODEL and every unchanged
  // item would otherwise keep its old-model vector, leaving one index holding
  // two embedding spaces. Cosine similarity across that boundary is meaningless
  // and nothing errors — the same silent-wrong-answer shape this resume logic
  // exists to prevent. Switching models now invalidates everything, which is
  // the correct and expensive direction.
  //
  // \x00 as the separator because it cannot occur in canonicalText, so no
  // (model, text) pair can collide with a different one.
  const texts = items.map(canonicalText);
  const hashes = texts.map((t) =>
    crypto.createHash('sha1').update(`${MODEL}\x00${t}`).digest('hex'),
  );
  const prevMeta = all ? {} : await readMeta();
  const prevIndex = all ? null : await loadIndex();
  const prevSlot = new Map(prevIndex?.ids.map((id, i) => [id, i]) ?? []);

  const ids: string[] = new Array(items.length);
  const vectors = new Float32Array(items.length * EMBED_DIM);

  const stale: number[] = [];
  for (let i = 0; i < items.length; i++) {
    ids[i] = items[i].id;
    const slot = prevSlot.get(items[i].id);
    if (prevIndex && slot !== undefined && prevMeta[items[i].id] === hashes[i]) {
      vectors.set(
        prevIndex.vectors.subarray(slot * EMBED_DIM, (slot + 1) * EMBED_DIM),
        i * EMBED_DIM,
      );
    } else {
      stale.push(i);
    }
  }

  console.log(
    `Embedding ${stale.length} of ${items.length} items with ${MODEL}` +
      (stale.length < items.length ? ` (${items.length - stale.length} reused)` : ''),
  );
  if (stale.length === 0) {
    console.log('Index already matches the catalog. Nothing to embed.');
    return;
  }

  const limit = pLimit(CONCURRENCY);
  let done = 0;

  const batches: number[][] = [];
  for (let i = 0; i < stale.length; i += BATCH) batches.push(stale.slice(i, i + BATCH));

  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const vecs = await embedBatch(
          batch.map((i) => texts[i]),
          apiKey,
        );
        if (vecs[0].length !== EMBED_DIM) {
          throw new Error(`embedding dim mismatch: got ${vecs[0].length}, expected ${EMBED_DIM}`);
        }
        for (let j = 0; j < vecs.length; j++) vectors.set(vecs[j], batch[j] * EMBED_DIM);
        done += batch.length;
        if (done % 512 === 0 || done === stale.length) console.log(`  ${done}/${stale.length}`);
      }),
    ),
  );

  await writeIndex(ids, vectors);
  await writeMeta(Object.fromEntries(items.map((it, i) => [it.id, hashes[i]])));
  console.log(`Wrote data/embeddings.f32 (${ids.length} vectors × ${EMBED_DIM})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
