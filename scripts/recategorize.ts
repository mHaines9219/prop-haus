/**
 * Re-run mapToUnifiedCategory over the live catalog after a rules change in
 * lib/categories.ts, without re-scraping.
 *
 *   npm run db:recategorize            # dry-run: print what would change
 *   npm run db:recategorize -- --apply # write changes + refresh facet counts
 *
 * Categories are computed at scrape time (scrapers/common/run.ts) from
 * sourceCategoryPath + name and stored on catalog.prop_items. This recomputes
 * the same input server-side. The prop_items_tsv trigger fires on UPDATE, so
 * search_tsv/keyword_tsv (both embed category) rebuild themselves per row.
 *
 * Updates are chunked with a pause between chunks — the keyword_tsv backfill
 * incident (see scripts/backfill-keyword-tsv.ts) showed one big UPDATE over
 * this table can saturate I/O and degrade live reads.
 *
 * CATALOG_DATABASE_URL is read from .env.local; needs a role that can UPDATE
 * catalog.prop_items and run catalog.refresh_facets().
 */
import { createRequire } from 'node:module';
import { Client } from 'pg';
import { mapToUnifiedCategory } from '../lib/categories';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env');
loadEnvConfig(process.cwd());

const READ_BATCH = 5000;
const WRITE_CHUNK = 1000;
const WRITE_PAUSE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.CATALOG_DATABASE_URL;
  if (!url) throw new Error('CATALOG_DATABASE_URL missing from .env.local');

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const changes: Array<{ id: string; to: string }> = [];
    const transitions = new Map<string, number>();
    const after = new Map<string, number>();
    let scanned = 0;
    let lastId = '';

    for (;;) {
      const { rows } = await client.query<{
        id: string;
        name: string;
        source_category_path: string[] | null;
        category: string;
      }>(
        `select id, name, source_category_path, category
           from catalog.prop_items
          where id > $1
          order by id
          limit $2`,
        [lastId, READ_BATCH],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id;
      scanned += rows.length;

      for (const row of rows) {
        const next = mapToUnifiedCategory([...(row.source_category_path ?? []), row.name]);
        after.set(next, (after.get(next) ?? 0) + 1);
        if (next !== row.category) {
          changes.push({ id: row.id, to: next });
          const key = `${row.category} -> ${next}`;
          transitions.set(key, (transitions.get(key) ?? 0) + 1);
        }
      }
      process.stderr.write(`\rscanned ${scanned}`);
    }
    process.stderr.write('\n');

    console.log(`\n${changes.length} of ${scanned} items change category.\n`);
    console.log('Top transitions:');
    for (const [key, n] of [...transitions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      console.log(`  ${String(n).padStart(6)}  ${key}`);
    }
    console.log('\nResulting distribution:');
    for (const [cat, n] of [...after.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(6)}  ${cat}`);
    }

    if (!apply) {
      console.log('\nDry-run. Re-run with --apply to write.');
      return;
    }

    let written = 0;
    for (let i = 0; i < changes.length; i += WRITE_CHUNK) {
      const chunk = changes.slice(i, i + WRITE_CHUNK);
      await client.query(
        `update catalog.prop_items p
            set category = v.category
           from (select unnest($1::text[]) as id, unnest($2::text[]) as category) v
          where p.id = v.id`,
        [chunk.map((c) => c.id), chunk.map((c) => c.to)],
      );
      written += chunk.length;
      process.stderr.write(`\rupdated ${written}/${changes.length}`);
      if (i + WRITE_CHUNK < changes.length) await sleep(WRITE_PAUSE_MS);
    }
    process.stderr.write('\n');

    console.log('Refreshing facet counts...');
    await client.query('select catalog.refresh_facets()');
    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
