import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';
import { priceFromShopifyVariants } from './common/price';

const SOURCE = 'heritage' as const;
const BASE = 'https://heritagepropsla.com';

type ShopifyImage = { src: string };
type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  product_type?: string;
  tags?: string[];
  images: ShopifyImage[];
  variants?: Array<{ price?: string }>;
};

async function fetchCollections(): Promise<Array<{ handle: string; title: string }>> {
  const out: Array<{ handle: string; title: string }> = [];
  for (let page = 1; ; page++) {
    let body: string;
    try {
      body = await fetchHtml(`${BASE}/collections.json?limit=250&page=${page}`);
    } catch {
      break;
    }
    let json: { collections?: Array<{ handle: string; title: string }> };
    try {
      json = JSON.parse(body);
    } catch {
      break;
    }
    const cols = json.collections || [];
    if (cols.length === 0) break;
    for (const c of cols) out.push({ handle: c.handle, title: c.title });
    if (cols.length < 250) break;
  }
  return out;
}

async function fetchCollectionProducts(handle: string): Promise<ShopifyProduct[]> {
  const out: ShopifyProduct[] = [];
  for (let page = 1; ; page++) {
    let body: string;
    try {
      body = await fetchHtml(`${BASE}/collections/${handle}/products.json?limit=250&page=${page}`);
    } catch {
      break;
    }
    let json: { products?: ShopifyProduct[] };
    try {
      json = JSON.parse(body);
    } catch {
      break;
    }
    const ps = json.products || [];
    if (ps.length === 0) break;
    out.push(...ps);
    if (ps.length < 250) break;
  }
  return out;
}

function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

async function main() {
  const limit = parseLimitArg();
  const collections = await fetchCollections();
  console.log(`Found ${collections.length} collections`);

  const byId = new Map<number, { product: ShopifyProduct; breadcrumb: string[] }>();
  for (const col of collections) {
    let prods: ShopifyProduct[];
    try {
      prods = await fetchCollectionProducts(col.handle);
    } catch (e) {
      console.warn(`  skip collection ${col.handle}: ${(e as Error).message}`);
      continue;
    }
    for (const p of prods) {
      if (!byId.has(p.id)) byId.set(p.id, { product: p, breadcrumb: [col.title] });
    }
    console.log(`  ${col.handle}: ${prods.length} products (running total ${byId.size})`);
    if (limit && byId.size >= limit) break;
  }

  let entries = [...byId.values()];
  if (limit) entries = entries.slice(0, limit);

  const items: ReturnType<typeof normalize>[] = [];
  for (const { product, breadcrumb } of entries) {
    const name = product.title?.trim();
    if (!name) continue;
    const images = product.images.map((i) => i.src).filter((s) => /^https?:\/\//.test(s));
    if (images.length === 0) continue;
    const raw: RawItem = {
      source: SOURCE,
      sourceId: product.handle || String(product.id),
      name,
      sourceCategoryPath: breadcrumb,
      images,
      sourceUrl: `${BASE}/products/${product.handle}`,
      description: stripHtml(product.body_html),
      price: priceFromShopifyVariants(product.variants),
    };
    try {
      items.push(normalize(raw));
    } catch (e) {
      console.warn(`  skip ${product.handle}: ${(e as Error).message}`);
    }
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
