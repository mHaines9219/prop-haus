/**
 * Reverse of db:load — dump catalog.prop_items from Postgres back to
 * data/catalog.json (the file the app UI reads via lib/catalog.ts).
 *
 * Use this to rehydrate a fresh worktree where the gitignored data/catalog.json
 * is missing but the catalog was already ingested into Supabase.
 *
 *   CATALOG_DATABASE_URL is read from .env.local (loaded via @next/env). A
 *   read-only role is sufficient — this only SELECTs. For Supabase, use the
 *   session pooler URI (IPv4-friendly):
 *     postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *
 * Rows are paged and stream-written so the ~90k-row catalog never has to live in
 * memory (or pass through a tool/model context) all at once.
 *
 *   npm run db:dump
 */
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from 'pg';
import { PropItem, type PropItem as PropItemT } from '../lib/types';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env');
loadEnvConfig(process.cwd());

const BATCH = 5000;

type Row = {
  id: string;
  source: string;
  source_id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  source_category_path: string[] | null;
  style: string[] | null;
  era: string | null;
  materials: string[] | null;
  colors: string[] | null;
  vibes: string[] | null;
  setting_type: string[] | null;
  genre_fit: string[] | null;
  tags: string[] | null;
  dimensions: unknown;
  vendor: unknown;
  images: string[] | null;
  source_url: string;
  scraped_at: Date | string;
  price_amount: number | string | null;
  price_currency: string | null;
  price_unit: string | null;
};

// Drop null/undefined so zod .optional() fields validate (they reject null).
function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === null || obj[k] === undefined) delete obj[k];
  }
  return obj;
}

function rowToItem(r: Row): PropItemT {
  const price =
    r.price_amount != null
      ? compact({
          amount: Number(r.price_amount),
          currency: r.price_currency ?? 'USD',
          unit: r.price_unit ?? undefined,
        })
      : undefined;

  const scrapedAt =
    r.scraped_at instanceof Date ? r.scraped_at.toISOString() : String(r.scraped_at);

  return compact({
    id: r.id,
    source: r.source,
    sourceId: r.source_id,
    name: r.name,
    description: r.description ?? undefined,
    category: r.category,
    subcategory: r.subcategory ?? undefined,
    sourceCategoryPath: r.source_category_path ?? [],
    style: r.style ?? undefined,
    era: r.era ?? undefined,
    materials: r.materials ?? undefined,
    colors: r.colors ?? undefined,
    vibes: r.vibes ?? undefined,
    settingType: r.setting_type ?? undefined,
    genreFit: r.genre_fit ?? undefined,
    tags: r.tags ?? undefined,
    dimensions: r.dimensions ?? undefined,
    price,
    vendor: r.vendor,
    images: r.images ?? [],
    sourceUrl: r.source_url,
    scrapedAt,
  }) as unknown as PropItemT;
}

const SELECT = `
  select id, source, source_id, name, description, category, subcategory,
         source_category_path, style, era, materials, colors, vibes,
         setting_type, genre_fit, tags, dimensions, vendor, images,
         source_url, scraped_at, price_amount, price_currency, price_unit
  from catalog.prop_items
  order by id
  limit $1 offset $2
`;

// Supabase pooler hostnames vary (aws-0 vs aws-1, region), so a guessed pooler
// URL often fails with "tenant/user not found". The DIRECT host is deterministic
// (db.<ref>.supabase.co, user `postgres`), so on a tenant error we rebuild the
// URL to the direct endpoint and retry. Direct needs IPv6; if that's missing the
// caller gets a clear ENETUNREACH instead of a confusing tenant error.
function toDirectUrl(conn: string): string | null {
  try {
    const u = new URL(conn);
    if (!u.hostname.includes('pooler.supabase.com')) return null;
    const ref = u.username.split('.')[1]; // postgres.<ref>
    if (!ref) return null;
    u.username = 'postgres';
    u.hostname = `db.${ref}.supabase.co`;
    u.port = '5432';
    return u.toString();
  } catch {
    return null;
  }
}

async function connect(conn: string): Promise<Client> {
  const mk = (cs: string) =>
    new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  try {
    const c = mk(conn);
    await c.connect();
    return c;
  } catch (e) {
    const msg = String((e as Error).message);
    const direct = toDirectUrl(conn);
    if (direct && /tenant|not found|ENOTFOUND/i.test(msg)) {
      console.warn('Pooler host rejected the tenant — retrying via direct connection (db.<ref>.supabase.co)…');
      const c = mk(direct);
      await c.connect();
      return c;
    }
    throw e;
  }
}

async function main() {
  const conn = process.env.CATALOG_DATABASE_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.error('CATALOG_DATABASE_URL (or DATABASE_URL) is not set in .env.local.');
    process.exit(1);
  }

  const client = await connect(conn);

  const file = path.join(process.cwd(), 'data', 'catalog.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const out = createWriteStream(file, { encoding: 'utf8' });
  const write = (s: string) =>
    new Promise<void>((res, rej) => out.write(s, (e) => (e ? rej(e) : res())));

  let total = 0;
  let bad = 0;
  try {
    await write('[\n');
    for (let offset = 0; ; offset += BATCH) {
      const { rows } = await client.query<Row>(SELECT, [BATCH, offset]);
      if (rows.length === 0) break;
      for (const r of rows) {
        const parsed = PropItem.safeParse(rowToItem(r));
        if (!parsed.success) {
          bad++;
          if (bad <= 5) console.warn(`  skipped invalid row ${r.id}: ${parsed.error.issues[0]?.message}`);
          continue;
        }
        await write((total === 0 ? '' : ',\n') + JSON.stringify(parsed.data));
        total++;
      }
      console.log(`  ${total} written…`);
      if (rows.length < BATCH) break;
    }
    await write('\n]\n');
  } finally {
    await new Promise<void>((res) => out.end(res));
    await client.end();
  }

  console.log(`Wrote ${total} items → data/catalog.json${bad ? ` (${bad} invalid rows skipped)` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
