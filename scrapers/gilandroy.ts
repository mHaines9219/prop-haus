import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'gilandroy' as const;
const BASE = 'https://www.gilandroyprops.tv';

// Gil & Roy is on Shopify. Use the global /products.json endpoint (paginated, 250/page max).
type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  images: Array<{ src: string }>;
};

async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= 500; page++) {
    const url = `${BASE}/products.json?limit=250&page=${page}`;
    let body: string;
    try { body = await fetchHtml(url); } catch (e) { console.warn(`  page ${page}: ${(e as Error).message}`); break; }
    let parsed: { products: ShopifyProduct[] };
    try { parsed = JSON.parse(body); } catch { break; }
    const products = parsed.products || [];
    if (products.length === 0) break;
    all.push(...products);
    console.log(`  page ${page}: +${products.length} (total ${all.length})`);
    if (products.length < 250) break;
  }
  return all;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDimensions(text: string): { width?: number; depth?: number; height?: number } | undefined {
  // Look for patterns like: 17" H x 21" W x 8.5" D
  const m = text.match(/(\d+(?:\.\d+)?)\s*"?\s*H\s*[x×]\s*(\d+(?:\.\d+)?)\s*"?\s*W\s*[x×]\s*(\d+(?:\.\d+)?)\s*"?\s*D/i);
  if (!m) return undefined;
  return { height: Number(m[1]), width: Number(m[2]), depth: Number(m[3]) };
}

function toRawItem(p: ShopifyProduct): RawItem | null {
  if (!p.title) return null;
  const images = (p.images || []).map((i) => i.src).filter((u) => /^https?:\/\//.test(u));
  if (images.length === 0) return null;
  const breadcrumb: string[] = [];
  if (p.product_type) breadcrumb.push(...p.product_type.split(/\s*•\s*|\s*\/\s*/).map((s) => s.trim()).filter(Boolean));
  if (breadcrumb.length === 0) breadcrumb.push('Props');
  const desc = p.body_html ? stripHtml(p.body_html) : undefined;
  const dims = desc ? parseDimensions(desc) : undefined;
  return {
    source: SOURCE,
    sourceId: String(p.id),
    name: p.title.trim(),
    sourceCategoryPath: breadcrumb,
    images,
    sourceUrl: `${BASE}/products/${p.handle}`,
    description: desc,
    dimensions: dims,
  };
}

async function main() {
  const limit = parseLimitArg();
  let products = await fetchAllProducts();
  console.log(`Total products: ${products.length}`);
  if (limit) products = products.slice(0, limit);
  const items = [];
  for (const p of products) {
    try {
      const raw = toRawItem(p);
      if (raw) items.push(normalize(raw));
    } catch (e) { console.warn(`  skip ${p.handle}: ${(e as Error).message}`); }
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => { console.error(e); process.exit(1); });
