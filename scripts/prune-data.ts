/**
 * Reconcile the on-disk snapshot and embedding index with the sources this
 * checkout knows about.
 *
 *   pnpm data:prune            # report only, writes nothing
 *   pnpm data:prune --write    # rewrite data/catalog.json + data/embeddings.{f32,ids.json}
 *
 * Why this exists
 * ---------------
 * `data/catalog.json` was built 2026-06-04. `6292167` (2026-06-29) removed two
 * out-of-region vendors from SOURCES — Shag Carpet (Dallas TX) and FormDecor
 * (Orange County) — and the snapshot was never regenerated. It therefore holds
 * 5,047 items from sources this checkout cannot name.
 *
 * That is not a cosmetic mismatch, because five call sites run the *whole array*
 * through `Catalog.parse`, where one bad item fails all of them:
 *
 *   lib/catalog.ts:28           (guarded by per-item safeParse in #13)
 *   scripts/enrich.ts:209       throws
 *   scripts/embed.ts:45         throws
 *   scripts/load-catalog.ts:64  throws
 *   scrapers/merge.ts:14        throws
 *
 * So `pnpm enrich`, `pnpm embed`, `pnpm db:load` and `pnpm scrape:merge` all die
 * on the same 5,047 items before doing any work.
 *
 * The index drifts the same way and costs differently: `shortlistByEmbedding`
 * (lib/search-index.ts:38-43) asks `topK` for k nearest vectors and *then* joins
 * against the catalog, discarding misses — so an orphan vector consumes a
 * shortlist slot and yields nothing. Measured on scene queries that was 23.2% of
 * slots, and 78% on the worst, turning a nominal top-50 into a top-11.
 *
 * Both artifacts are rewritten from the same `kept` array in one pass, which is
 * the point: pruning them separately is how they drifted apart to begin with.
 *
 * Re-running `pnpm scrape:merge` would reach the same place by re-scraping every
 * vendor. This does it from the snapshot instead — no network, no spend, and it
 * keeps embeddings we have already paid for (`pnpm embed` is not incremental).
 * Use `pnpm embed` when the *text* behind an item changes; use this when the
 * *set* of items changes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PropItem, type PropItem as PropItemT } from '../lib/types';
import { loadIndex, writeIndex, EMBED_DIM } from '../lib/embeddings';

const CATALOG = path.join(process.cwd(), 'data', 'catalog.json');

type Survey = {
  kept: PropItemT[];
  total: number;
  invalidBySource: Map<string, number>;
};

/**
 * Per-item safeParse rather than Catalog.parse: we need the survivors, not an
 * exception. Same criterion loadCatalog applies, so what gets written back is
 * exactly what the app would have served.
 */
async function surveyCatalog(): Promise<Survey> {
  const raw = JSON.parse(await fs.readFile(CATALOG, 'utf8')) as unknown[];
  const kept: PropItemT[] = [];
  const invalidBySource = new Map<string, number>();

  for (const row of raw) {
    const parsed = PropItem.safeParse(row);
    if (parsed.success) {
      kept.push(parsed.data);
      continue;
    }
    // Bucket rejects by claimed source so the report names the culprit rather
    // than just counting failures.
    const source =
      row && typeof row === 'object' && typeof (row as { source?: unknown }).source === 'string'
        ? (row as { source: string }).source
        : '(unparseable)';
    invalidBySource.set(source, (invalidBySource.get(source) ?? 0) + 1);
  }

  return { kept, total: raw.length, invalidBySource };
}

/** Temp file + rename, so an interrupted write cannot leave a half-written 95 MB snapshot. */
async function writeCatalogAtomic(items: PropItemT[]) {
  const tmp = `${CATALOG}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items), 'utf8');
  await fs.rename(tmp, CATALOG);
}

async function main() {
  const write = process.argv.includes('--write');

  const { kept, total, invalidBySource } = await surveyCatalog();
  const keptIds = new Set(kept.map((i) => i.id));

  console.log(`catalog.json     ${total} rows -> ${kept.length} valid items`);
  for (const [source, n] of [...invalidBySource].sort((a, b) => b[1] - a[1])) {
    console.log(`  rejected  ${String(n).padStart(6)}  ${source}`);
  }

  const index = await loadIndex();
  if (index) {
    console.log(`index            ${index.ids.length} vectors`);
  } else {
    console.log('index            absent — run `pnpm embed` to build it');
  }

  const keepPositions: number[] = [];
  if (index) {
    for (let i = 0; i < index.ids.length; i++) {
      if (keptIds.has(index.ids[i])) keepPositions.push(i);
    }
  }
  const orphanVectors = index ? index.ids.length - keepPositions.length : 0;

  // The reverse drift: a kept item with no vector can never be retrieved by
  // embedding search at all. Pruning cannot fix that — it needs `pnpm embed` —
  // but it should be visible rather than discovered later.
  const indexIds = new Set(index?.ids ?? []);
  const missingVectors = index ? [...keptIds].filter((id) => !indexIds.has(id)).length : 0;

  const catalogStale = total !== kept.length;
  console.log(
    `\ncatalog: drop ${total - kept.length} invalid rows · index: drop ${orphanVectors} orphan vectors` +
      (missingVectors ? ` · ${missingVectors} kept items have NO vector (run \`pnpm embed\`)` : ''),
  );

  if (!catalogStale && orphanVectors === 0) {
    console.log('Catalog and index already agree. Nothing to do.');
    return;
  }

  if (!write) {
    console.log('\nReport only. Re-run with --write to rewrite the artifacts.');
    return;
  }

  if (catalogStale) {
    await writeCatalogAtomic(kept);
    console.log(`Wrote data/catalog.json (${kept.length} items)`);
  }

  if (index && orphanVectors > 0) {
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
