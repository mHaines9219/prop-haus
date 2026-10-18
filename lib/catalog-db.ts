/**
 * Catalog reads, served from Postgres.
 *
 * The catalog is ~90k rows of public reference data that changes only on a
 * pipeline load. `lib/catalog.ts` reads it from `data/catalog.json`, which is
 * gitignored — so on a deploy the file is simply absent and every browse
 * surface renders empty. This module is the replacement path.
 *
 * Why a bare anon client rather than lib/supabase/server.ts: that one binds to
 * the request's cookies, which opts a page out of static rendering and ties a
 * public catalog read to a session it does not need. The catalog's RLS policy
 * is a public-read grant, so the anon key is the correct and cheapest caller.
 *
 * Query shapes here are the ones #35 measured and indexed. In particular
 * `has_images` is a boolean column with a matching expression index — filtering
 * on the underlying array instead sequential-scans 890 MB and times out.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseCatalogItems, describeRejections } from "./catalog-parse";
import {
  ATTRIBUTE_GROUPS,
  EMPTY_FACETS,
  type AttributeColumn,
  type AttributeFacets,
  type AttributeFilters,
  type AttributeKey,
} from "./category-filters";
import type { CardItem, PropItem, PriceUnit } from "./types";

/** Columns a full PropItem needs. Excludes embedding and search_tsv by omission. */
const FULL_COLUMNS =
  "id,source,source_id,name,description,category,subcategory,source_category_path," +
  "style,era,materials,colors,vibes,setting_type,genre_fit,tags,dimensions,vendor," +
  "images,source_url,scraped_at,price_amount,price_currency,price_unit,plate_mode";

/** What a card renders. Extended to carry camera-report data and cart fields. */
const CARD_COLUMNS =
  "id,source,source_id,name,subcategory,images," +
  "category,source_url,plate_mode,dimensions,price_amount,price_currency,price_unit";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required to read the catalog",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

type CardRow = {
  id: string;
  source: string;
  source_id: string;
  name: string;
  subcategory: string | null;
  images: string[] | null;
  category: string;
  source_url: string;
  plate_mode: string | null;
  dimensions: { width?: number; depth?: number; height?: number; unit?: 'in' } | null;
  price_amount: string | null;
  price_currency: string | null;
  price_unit: string | null;
};

function rowToCard(row: CardRow): CardItem {
  const amount =
    row.price_amount === null || row.price_amount === undefined
      ? undefined
      : Number(row.price_amount);
  return {
    id: row.id,
    source: row.source as CardItem["source"],
    sourceId: row.source_id,
    name: row.name,
    subcategory: row.subcategory ?? undefined,
    images: (row.images ?? []).slice(0, 1),
    category: row.category,
    sourceUrl: row.source_url,
    plateMode: (row.plate_mode as "cutout" | "photo" | null) ?? undefined,
    dimensions: row.dimensions ? { ...row.dimensions, unit: 'in' as const } : undefined,
    price:
      amount === undefined
        ? undefined
        : {
            amount,
            currency: row.price_currency ?? "USD",
            unit: (row.price_unit as PriceUnit | null) ?? undefined,
          },
  };
}

/**
 * snake_case row -> the camelCase shape PropItem validates. Price is three
 * columns in Postgres and one nested object in the type; PostgREST returns
 * numeric as a string, so price_amount is parsed rather than passed through —
 * the same string-vs-number trap that hid in the rental-duration bug.
 */
function rowToItemShape(row: Record<string, unknown>): unknown {
  const amount =
    row.price_amount === null || row.price_amount === undefined
      ? undefined
      : Number(row.price_amount);
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category,
    subcategory: row.subcategory ?? undefined,
    sourceCategoryPath: row.source_category_path ?? [],
    style: row.style ?? undefined,
    era: row.era ?? undefined,
    materials: row.materials ?? undefined,
    colors: row.colors ?? undefined,
    vibes: row.vibes ?? undefined,
    settingType: row.setting_type ?? undefined,
    genreFit: row.genre_fit ?? undefined,
    tags: row.tags ?? undefined,
    dimensions: row.dimensions ?? undefined,
    vendor: row.vendor,
    images: row.images ?? [],
    sourceUrl: row.source_url,
    scrapedAt: row.scraped_at,
    plateMode: row.plate_mode ?? undefined,
    price:
      amount === undefined
        ? undefined
        : {
            amount,
            currency: row.price_currency ?? "USD",
            unit: row.price_unit ?? undefined,
          },
  };
}

/**
 * Validate per item rather than as an array, for the reason lib/catalog-parse.ts
 * exists: one unexpected row should cost that row, not the page.
 */
function toItems(rows: Record<string, unknown>[], label: string): PropItem[] {
  const report = parseCatalogItems(rows.map(rowToItemShape));
  const complaint = describeRejections(report, label);
  if (complaint) console.warn(complaint);
  return report.items;
}

export type BrowsePage = { items: CardItem[]; total: number };

/**
 * One page of the browse grid.
 *
 * `total` comes from the facet_counts materialized view, NOT PostgREST's
 * `count: "exact"`. Exact count drags every matching row — image arrays and
 * all — through a window aggregate: ~10s against the anon role's 3s statement
 * timeout, which 500'd every browse surface. The MV filters on the same
 * has_images predicate as this query, so the numbers agree; it is refreshed on
 * catalog load, which is the only time they can drift.
 */
export async function browseCards(opts: {
  category?: string | null;
  vendor?: string | null;
  offset?: number;
  limit?: number;
}): Promise<BrowsePage> {
  const offset = Math.max(0, opts.offset ?? 0);
  // Ceiling is generous here; each caller clamps to its own maximum (the browse
  // route to 60, the category page to its render cap).
  const limit = Math.min(200, Math.max(1, opts.limit ?? 24));

  let q = db()
    .from("prop_items")
    .select(CARD_COLUMNS)
    .eq("has_images", true)
    // ORDER BY id keeps results deterministic across pages and nudges the
    // planner toward the partial index on has_images rather than a seq scan.
    .order("id");
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.vendor) q = q.eq("source", opts.vendor);

  const [total, { data, error }] = await Promise.all([
    browseTotal(opts),
    q.range(offset, offset + limit - 1),
  ]);

  // PGRST103: the offset is past the last row. PostgREST calls that a 416, but
  // for a paged grid it is simply the end of the list — the infinite-scroll
  // query can ask for it whenever the total shrinks between pages. Return an
  // empty page with the real total rather than surfacing a 500.
  if (error?.code === "PGRST103") {
    return { items: [], total };
  }
  if (error) throw new Error(`[catalog-db] browse failed: ${error.message}`);
  return {
    items: (data ?? []).map((r) => rowToCard(r as unknown as CardRow)),
    total,
  };
}

/**
 * Matching-row total for a browse query. Single-dimension filters (and no
 * filter) are precomputed in the facets MV; only the category+vendor
 * combination needs a live count, and that one runs over a small
 * partial-index subset rather than the whole catalog.
 */
async function browseTotal(opts: {
  category?: string | null;
  vendor?: string | null;
}): Promise<number> {
  if (opts.category && opts.vendor) return countMatching(opts);
  const facets = await catalogFacets();
  if (opts.category) return facets.categories[opts.category] ?? 0;
  if (opts.vendor) return facets.vendors[opts.vendor] ?? 0;
  return facets.total;
}

async function countMatching(opts: {
  category?: string | null;
  vendor?: string | null;
}): Promise<number> {
  let q = db()
    .from("prop_items")
    .select("id", { count: "exact", head: true })
    .eq("has_images", true);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.vendor) q = q.eq("source", opts.vendor);
  const { count, error } = await q;
  if (error) throw new Error(`[catalog-db] count failed: ${error.message}`);
  return count ?? 0;
}

/** One item by its vendor-scoped identity, the shape the detail route carries. */
export async function getItemBySourceId(
  source: string,
  sourceId: string,
): Promise<PropItem | undefined> {
  const { data, error } = await db()
    .from("prop_items")
    .select(FULL_COLUMNS)
    .eq("source", source)
    .eq("source_id", sourceId)
    .limit(1);
  if (error) throw new Error(`[catalog-db] getItem failed: ${error.message}`);
  return toItems(
    (data ?? []) as unknown as Record<string, unknown>[],
    "item",
  )[0];
}

/**
 * Full items for a set of catalog ids, in one round trip.
 *
 * The order-to-Spacelab handoff (FUT-2) needs dimensions and enrichment for
 * every line on an order at once; calling getItemBySourceId per line would be a
 * query per item. Ids are chunked because they travel in the query string, and
 * a missing id is simply absent from the result — an item can be de-listed
 * between checkout and a set preview, and the order snapshot still carries the
 * name and photo.
 */
export async function itemsByIds(ids: string[]): Promise<PropItem[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];

  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await db()
        .from("prop_items")
        .select(FULL_COLUMNS)
        .in("id", chunk);
      if (error) throw new Error(`[catalog-db] itemsByIds failed: ${error.message}`);
      return toItems((data ?? []) as unknown as Record<string, unknown>[], "items-by-id");
    }),
  );
  return pages.flat();
}

/** Cards for one category. Capped — see the note in app/category/[slug]/page.tsx. */
export async function categoryCards(
  slug: string,
  limit = 120,
): Promise<BrowsePage> {
  return browseCards({ category: slug, limit, offset: 0 });
}

export type CategoryPage = { items: CardItem[]; capped: boolean };

export type CategoryNarrowing = {
  /** Free text, run as a websearch full-text query. */
  query?: string;
  /** Attribute selections from the filter rail. */
  filters?: AttributeFilters;
};

/**
 * One category, narrowed by the search bar and/or the filter rail.
 *
 * Text runs as Postgres full-text search over `search_tsv` (name, description,
 * tags, style, category, subcategory; trigger-maintained, GIN-indexed) in
 * websearch syntax, so plain words AND together, "quoted phrases" and -minus
 * work, and "lamps" finds "lamp". LIKE scans over the same rows were measured
 * against the anon role's 3s statement timeout and lost (name alone, ordered,
 * 2.5s in lighting; any LIKE in `other` timed out); the tsvector query answers
 * in tens of milliseconds in both.
 *
 * Attribute filters OR within a group (`colors && '{black,gray}'`) and AND
 * across groups; era is a scalar column so it uses IN. Measured at ~90–300ms
 * per category over the (category, id) partial index. No total: an exact
 * count re-runs the scan (2.5s measured), and the page only needs to know
 * whether it is full, which `capped` reports.
 */
export async function filterCategoryCards(
  slug: string,
  narrowing: CategoryNarrowing,
  limit = 120,
): Promise<CategoryPage> {
  const q = (narrowing.query ?? "").replace(/\s+/g, " ").trim();
  const filters = narrowing.filters ?? {};
  const max = Math.min(200, Math.max(1, limit));

  let query = db()
    .from("prop_items")
    .select(CARD_COLUMNS)
    .eq("has_images", true)
    .eq("category", slug);
  if (q) query = query.textSearch("search_tsv", q, { type: "websearch", config: "english" });
  for (const g of ATTRIBUTE_GROUPS) {
    const values = filters[g.key];
    if (!values?.length) continue;
    query = g.scalar ? query.in(g.column, values) : query.overlaps(g.column, values);
  }

  const { data, error } = await query.order("id").limit(max);
  if (error) throw new Error(`[catalog-db] category filter failed: ${error.message}`);
  const items = (data ?? []).map((r) => rowToCard(r as unknown as CardRow));
  return { items, capped: items.length >= max };
}

/** Rows the facet RPC returns: one list per attribute COLUMN, ordered by count. */
type FacetRpcRow = Partial<Record<AttributeColumn, Array<{ value: string; n: number | string }>>>;

/** Most values the rail receives per attribute. Tags are a long tail; this is its head. */
const FACET_VALUES_PER_GROUP = 40;

/**
 * Every attribute value in one category and how many items carry it, for the
 * filter rail. Reads the precomputed catalog.attribute_counts through the
 * category_attribute_facets RPC (migration 20261017200000).
 *
 * Until that migration is on the database the RPC does not exist (PostgREST
 * answers PGRST202), and the same numbers are aggregated here from the rows
 * instead. That bridge is correct but slow on a large category (eleven
 * keyset pages of a thousand rows for artwork-wall) and so is cached in
 * memory per instance; the RPC path makes it a single ~70ms call.
 */
export async function categoryAttributeFacets(slug: string): Promise<AttributeFacets> {
  const { data, error } = await db()
    .rpc("category_attribute_facets", { p_category: slug, p_limit: FACET_VALUES_PER_GROUP })
    .single();
  if (error?.code === "PGRST202") {
    warnFacetBridgeOnce();
    return aggregateAttributeFacets(slug);
  }
  if (error) throw new Error(`[catalog-db] attribute facets failed: ${error.message}`);
  return fromRpcRow((data ?? {}) as FacetRpcRow);
}

function fromRpcRow(row: FacetRpcRow): AttributeFacets {
  const out: AttributeFacets = { ...EMPTY_FACETS };
  for (const g of ATTRIBUTE_GROUPS) {
    out[g.key] = (row[g.column] ?? [])
      .map((v) => ({ value: String(v.value), n: Number(v.n) }))
      .filter((v) => v.value && v.n > 0);
  }
  return out;
}

let facetBridgeWarned = false;
function warnFacetBridgeOnce() {
  if (facetBridgeWarned) return;
  facetBridgeWarned = true;
  console.warn(
    "[catalog-db] category_attribute_facets RPC is not on this database; aggregating attribute facets " +
      "per request instead. Apply migration 20261017200000 (pnpm db:push) for the precomputed path.",
  );
}

// A literal, not a join over ATTRIBUTE_GROUPS: supabase-js parses the select
// list at the type level and a computed string makes every row a ParserError.
const BRIDGE_COLUMNS = "id,era,style,vibes,materials,colors,setting_type,genre_fit,tags";
const BRIDGE_PAGE = 1000;
const BRIDGE_TTL_MS = 60 * 60 * 1000;
const bridgeCache = new Map<string, { at: number; facets: AttributeFacets }>();

/**
 * The bridge: walk the category's attribute columns in keyset pages (`id >
 * last`, which the (category, id) partial index serves without the deep
 * OFFSET scans that timed out when measured) and count in process.
 */
async function aggregateAttributeFacets(slug: string): Promise<AttributeFacets> {
  const hit = bridgeCache.get(slug);
  if (hit && Date.now() - hit.at < BRIDGE_TTL_MS) return hit.facets;

  const counts = new Map<AttributeKey, Map<string, number>>(
    ATTRIBUTE_GROUPS.map((g) => [g.key, new Map<string, number>()]),
  );
  let after: string | null = null;
  for (;;) {
    let q = db()
      .from("prop_items")
      .select(BRIDGE_COLUMNS)
      .eq("has_images", true)
      .eq("category", slug)
      .order("id")
      .limit(BRIDGE_PAGE);
    if (after !== null) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error(`[catalog-db] attribute facets failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const row of rows) {
      for (const g of ATTRIBUTE_GROUPS) {
        const raw = row[g.column];
        const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
        const bucket = counts.get(g.key)!;
        for (const v of values) {
          if (typeof v !== "string" || !v) continue;
          bucket.set(v, (bucket.get(v) ?? 0) + 1);
        }
      }
    }
    if (rows.length < BRIDGE_PAGE) break;
    after = String(rows[rows.length - 1].id);
  }

  const facets: AttributeFacets = { ...EMPTY_FACETS };
  for (const g of ATTRIBUTE_GROUPS) {
    facets[g.key] = [...counts.get(g.key)!.entries()]
      .map(([value, n]) => ({ value, n }))
      .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value))
      .slice(0, FACET_VALUES_PER_GROUP);
  }
  bridgeCache.set(slug, { at: Date.now(), facets });
  return facets;
}

/**
 * Cards for a non-paginated strip (the item page's "More in …" row). Unlike
 * browseCards this skips the total entirely — computing it costs a facets RPC
 * round trip, and a strip that never pages has no use for it.
 */
export async function relatedCards(slug: string, limit: number): Promise<CardItem[]> {
  const { data, error } = await db()
    .from("prop_items")
    .select(CARD_COLUMNS)
    .eq("has_images", true)
    .eq("category", slug)
    .limit(limit);
  if (error) throw new Error(`[catalog-db] related failed: ${error.message}`);
  return (data ?? []).map((r) => rowToCard(r as unknown as CardRow));
}

export type Facets = {
  categories: Record<string, number>;
  vendors: Record<string, number>;
  total: number;
};

/**
 * Category counts, vendor counts and the catalog total, precomputed. A live
 * GROUP BY over 90k rows exceeded the statement timeout at 3.2s; this reads the
 * materialized view #35 added, refreshed on catalog load.
 */
export async function catalogFacets(): Promise<Facets> {
  const { data, error } = await db().rpc("catalog_facets").single();
  if (error) throw new Error(`[catalog-db] facets failed: ${error.message}`);
  const row = data as {
    categories: Record<string, number>;
    vendors: Record<string, number>;
    total: number;
  };
  return {
    categories: row.categories ?? {},
    vendors: row.vendors ?? {},
    total: Number(row.total ?? 0),
  };
}
