/**
 * Load the merged catalog (data/catalog.json) + embeddings into Postgres.
 *
 * Pipeline position:  scrape → merge → enrich → embed → **db:load**
 *
 * Strategy is load-then-swap (see migration 20260627190000_catalog_inventory):
 *   1. TRUNCATE catalog.prop_items_staging
 *   2. bulk-insert every item into staging
 *   3. verify the staged count matches the file
 *   4. SELECT catalog.swap_in_staging()  — atomic promote (readers see old rows
 *      until commit), so the live catalog is never half-written.
 *
 * ISOLATION: connect as the scoped `catalog_writer` role, never the Supabase
 * service role. catalog_writer has zero grants on public/auth, so a bad load
 * cannot touch user accounts. Point CATALOG_DATABASE_URL at that role, e.g.
 *   postgresql://catalog_writer:<pw>@db.<ref>.supabase.co:5432/postgres
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { parseCatalogItemsStrict } from '../lib/catalog-parse';
import type { PropItem } from '../lib/types';
import { loadIndex, EMBED_DIM } from '../lib/embeddings';

const BATCH = 200; // rows per multi-row INSERT (×25 cols ≈ 5k params, well under 65535)

// Roles that bypass the isolation boundary. Refuse them unless explicitly forced.
const PRIVILEGED = new Set(['postgres', 'supabase_admin', 'service_role', 'authenticator', 'supabase_auth_admin']);

// Column → value extractor. Order/casts mirror catalog.prop_items (minus the
// trigger-generated search_tsv). node-pg serializes JS arrays to text[]; jsonb
// and vector are passed as strings with an explicit cast.
type Col = { name: string; cast: string; val: (it: PropItem, emb: string | null) => unknown };
const COLS: Col[] = [
  { name: 'id', cast: '', val: (it) => it.id },
  { name: 'source', cast: '', val: (it) => it.source },
  { name: 'source_id', cast: '', val: (it) => it.sourceId },
  { name: 'name', cast: '', val: (it) => it.name },
  { name: 'description', cast: '', val: (it) => it.description ?? null },
  { name: 'category', cast: '', val: (it) => it.category },
  { name: 'subcategory', cast: '', val: (it) => it.subcategory ?? null },
  { name: 'source_category_path', cast: '::text[]', val: (it) => it.sourceCategoryPath ?? [] },
  { name: 'style', cast: '::text[]', val: (it) => it.style ?? null },
  { name: 'era', cast: '', val: (it) => it.era ?? null },
  { name: 'materials', cast: '::text[]', val: (it) => it.materials ?? null },
  { name: 'colors', cast: '::text[]', val: (it) => it.colors ?? null },
  { name: 'vibes', cast: '::text[]', val: (it) => it.vibes ?? null },
  { name: 'setting_type', cast: '::text[]', val: (it) => it.settingType ?? null },
  { name: 'genre_fit', cast: '::text[]', val: (it) => it.genreFit ?? null },
  { name: 'tags', cast: '::text[]', val: (it) => it.tags ?? null },
  { name: 'dimensions', cast: '::jsonb', val: (it) => (it.dimensions ? JSON.stringify(it.dimensions) : null) },
  { name: 'vendor', cast: '::jsonb', val: (it) => JSON.stringify(it.vendor) },
  { name: 'images', cast: '::text[]', val: (it) => it.images ?? [] },
  { name: 'source_url', cast: '', val: (it) => it.sourceUrl },
  { name: 'scraped_at', cast: '::timestamptz', val: (it) => it.scrapedAt },
  { name: 'embedding', cast: '::extensions.halfvec', val: (_it, emb) => emb },
  { name: 'price_amount', cast: '', val: (it) => it.price?.amount ?? null },
  { name: 'price_currency', cast: '', val: (it) => it.price?.currency ?? null },
  { name: 'price_unit', cast: '', val: (it) => it.price?.unit ?? null },
];

async function loadCatalogFile(): Promise<PropItem[]> {
  const file = path.join(process.cwd(), 'data', 'catalog.json');
  const raw = await fs.readFile(file, 'utf8');
  return parseCatalogItemsStrict(JSON.parse(raw), 'db:load');
}

// Build an id → "[f1,f2,…]" pgvector literal map from the embeddings index.
async function loadEmbeddingLiterals(): Promise<Map<string, string>> {
  const index = await loadIndex();
  const map = new Map<string, string>();
  if (!index) {
    console.warn('No embeddings index found (data/embeddings.f32) — loading with NULL embeddings.');
    return map;
  }
  const { ids, vectors, dim } = index;
  if (dim !== EMBED_DIM) throw new Error(`Embedding dim ${dim} != expected ${EMBED_DIM}`);
  for (let i = 0; i < ids.length; i++) {
    const slice = vectors.subarray(i * dim, i * dim + dim);
    map.set(ids[i], `[${slice.join(',')}]`);
  }
  return map;
}

async function insertBatch(client: Client, rows: PropItem[], emb: Map<string, string>) {
  const params: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((it, r) => {
    const base = r * COLS.length;
    const ph = COLS.map((c, ci) => `$${base + ci + 1}${c.cast}`);
    tuples.push(`(${ph.join(',')})`);
    COLS.forEach((c) => params.push(c.val(it, emb.get(it.id) ?? null)));
  });
  const cols = COLS.map((c) => c.name).join(', ');
  await client.query(`insert into catalog.prop_items (${cols}) values ${tuples.join(',')}`, params);
}

async function main() {
  const conn = process.env.CATALOG_DATABASE_URL;
  if (!conn) {
    console.error('CATALOG_DATABASE_URL is not set. Point it at the catalog_writer role:');
    console.error('  postgresql://catalog_writer:<password>@db.<ref>.supabase.co:5432/postgres');
    process.exit(1);
  }

  const [items, emb] = await Promise.all([loadCatalogFile(), loadEmbeddingLiterals()]);
  const withPrice = items.filter((i) => i.price).length;
  const withEmb = items.filter((i) => emb.has(i.id)).length;
  console.log(`Catalog: ${items.length} items | ${withPrice} priced | ${withEmb} embedded`);

  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const { rows: who } = await client.query<{ current_user: string }>('select current_user');
    const role = who[0].current_user;
    if (PRIVILEGED.has(role) && process.env.ALLOW_PRIVILEGED_LOAD !== '1') {
      throw new Error(
        `Refusing to load as privileged role "${role}" — this bypasses catalog isolation. ` +
          `Use the catalog_writer connection string, or set ALLOW_PRIVILEGED_LOAD=1 to override.`,
      );
    }
    console.log(`Connected as "${role}".`);

    // Direct load (disk-efficient): no staging duplicate, and the HNSW index is
    // dropped during the bulk insert so index pages aren't churned per row, then
    // rebuilt once at the end. The catalog isn't read from Postgres yet, so the
    // brief empty window during load is invisible to users.
    await client.query('drop index if exists catalog.prop_items_embedding_idx');
    await client.query('truncate catalog.prop_items');
    for (let i = 0; i < items.length; i += BATCH) {
      await insertBatch(client, items.slice(i, i + BATCH), emb);
      if ((i / BATCH) % 25 === 0) console.log(`  loaded ${Math.min(i + BATCH, items.length)}/${items.length}`);
    }

    const { rows: cnt } = await client.query<{ n: string }>('select count(*)::text as n from catalog.prop_items');
    const loaded = Number(cnt[0].n);
    if (loaded !== items.length) throw new Error(`Loaded ${loaded} but file had ${items.length}.`);
    console.log(`Loaded ${loaded} rows. Building HNSW index...`);

    await client.query(
      'create index prop_items_embedding_idx on catalog.prop_items using hnsw (embedding extensions.halfvec_cosine_ops)',
    );
    console.log('HNSW index built. catalog.prop_items is live.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
