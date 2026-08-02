/**
 * Drop embedding vectors whose catalog item no longer exists.
 *
 *   pnpm prune:index            # report only
 *   pnpm prune:index --write    # rewrite data/embeddings.{f32,ids.json}
 *
 * Why this exists
 * ---------------
 * `data/embeddings.f32` and `data/catalog.json` are independent artifacts that
 * can drift apart. They currently have: the index holds 95,863 vectors, the
 * catalog validates to 90,816 items. The 5,047 orphans are Shag Carpet (Dallas)
 * and FormDecor (Orange County), removed as out-of-region in 6292167 — the
 * index was built before that removal and never regenerated.
 *
 * Drift is not harmless. `shortlistByEmbedding` (lib/search-index.ts:38-43)
 * asks `topK` for k nearest vectors and *then* joins against the catalog,
 * discarding misses. An orphan vector therefore consumes a shortlist slot and
 * yields nothing, silently shrinking the shortlist. Measured on scene queries
 * this costs 23.2% of slots on average and 78% on the worst one, so a
 * nominal top-50 can really be a top-11.
 *
 * Pruning rather than re-embedding is deliberate: the vectors for the items we
 * keep are still correct, so this is a filter over existing data and costs no
 * API calls. Run `pnpm embed` instead when the *text* behind an item changes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PropItem } from '../lib/types';
import { loadIndex, writeIndex, EMBED_DIM } from '../lib/embeddings';

const CATALOG = path.join(process.cwd(), 'data', 'catalog.json');

/**
 * Ids the app will actually serve. Uses per-item safeParse — the same criterion
 * loadCatalog applies — so the index matches what the catalog exposes rather
 * than what the file happens to contain.
 */
async function validCatalogIds(): Promise<{ ids: Set<string>; total: number; invalidBySource: Map<string, number> }> {
  const raw = JSON.parse(await fs.readFile(CATALOG, 'utf8')) as unknown[];
  const ids = new Set<string>();
  const invalidBySource = new Map<string, number>();

  for (const row of raw) {
    const parsed = PropItem.safeParse(row);
    if (parsed.success) {
      ids.add(parsed.data.id);
      continue;
    }
    // Bucket rejects by their claimed source so the report names the culprit
    // rather than just counting failures.
    const source =
      row && typeof row === 'object' && typeof (row as { source?: unknown }).source === 'string'
        ? (row as { source: string }).source
        : '(unparseable)';
    invalidBySource.set(source, (invalidBySource.get(source) ?? 0) + 1);
  }

  return { ids, total: raw.length, invalidBySource };
}

async function main() {
  const write = process.argv.includes('--write');

  const index = await loadIndex();
  if (!index) {
    console.error('No embeddings index found (data/embeddings.f32 + embeddings.ids.json). Run `pnpm embed` first.');
    process.exit(1);
  }

  const { ids: keepIds, total, invalidBySource } = await validCatalogIds();

  console.log(`catalog.json     ${total} rows -> ${keepIds.size} valid items`);
  if (invalidBySource.size) {
    for (const [source, n] of [...invalidBySource].sort((a, b) => b[1] - a[1])) {
      console.log(`  rejected  ${String(n).padStart(6)}  ${source}`);
    }
  }
  console.log(`index            ${index.ids.length} vectors`);

  const keepPositions: number[] = [];
  const orphans: string[] = [];
  for (let i = 0; i < index.ids.length; i++) {
    if (keepIds.has(index.ids[i])) keepPositions.push(i);
    else orphans.push(index.ids[i]);
  }

  // A catalog item with no vector is the opposite drift: it can never be
  // retrieved by embedding search at all. Worth naming even though pruning
  // cannot fix it — that one needs `pnpm embed`.
  const indexIds = new Set(index.ids);
  const missingVectors = [...keepIds].filter((id) => !indexIds.has(id));

  console.log(
    `\nkeep ${keepPositions.length} · drop ${orphans.length} orphan vectors` +
      (missingVectors.length ? ` · ${missingVectors.length} catalog items have NO vector (run \`pnpm embed\`)` : ''),
  );

  if (orphans.length === 0 && missingVectors.length === 0) {
    console.log('Index and catalog already agree. Nothing to do.');
    return;
  }

  if (!write) {
    console.log('\nReport only. Re-run with --write to rewrite the index files.');
    return;
  }

  const vectors = new Float32Array(keepPositions.length * EMBED_DIM);
  const ids = new Array<string>(keepPositions.length);
  for (let n = 0; n < keepPositions.length; n++) {
    const src = keepPositions[n] * EMBED_DIM;
    vectors.set(index.vectors.subarray(src, src + EMBED_DIM), n * EMBED_DIM);
    ids[n] = index.ids[keepPositions[n]];
  }

  await writeIndex(ids, vectors);
  console.log(`Wrote data/embeddings.f32 (${ids.length} vectors × ${EMBED_DIM}) and data/embeddings.ids.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
