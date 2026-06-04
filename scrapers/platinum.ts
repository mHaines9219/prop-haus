import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'platinum' as const;
const BASE = 'https://platinumprophouse.com';

type ShopifyImage = { src: string };
type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  product_type?: string;
  tags?: string[];
  images: ShopifyImage[];
};

function stripHtml(s?: string) {
  if (!s) return undefined;
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim() || undefined;
}

async function fetchPage(page: number): Promise<ShopifyProduct[]> {
  const url = `${BASE}/collections/all/products.json?limit=250&page=${page}`;
  const body = await fetchHtml(url);
  const json = JSON.parse(body) as { products: ShopifyProduct[] };
  return json.products || [];
}

async function main() {
  const limit = parseLimitArg();
  const items: ReturnType<typeof normalize>[] = [];
  for (let page = 1; page <= 50; page++) {
    let products: ShopifyProduct[];
    try {
      products = await fetchPage(page);
    } catch (e) {
      console.warn(`page ${page}: ${(e as Error).message}`);
      break;
    }
    if (products.length === 0) break;
    console.log(`  page ${page}: ${products.length} products`);
    for (const p of products) {
      const images = p.images.map((i) => i.src).filter((s) => /^https?:\/\//.test(s));
      if (images.length === 0) continue;
      const breadcrumb = [p.product_type || 'All', ...(p.tags || []).slice(0, 2)].filter(Boolean);
      const raw: RawItem = {
        source: SOURCE,
        sourceId: p.handle || String(p.id),
        name: p.title.trim(),
        sourceCategoryPath: breadcrumb.length ? breadcrumb : ['All'],
        images,
        sourceUrl: `${BASE}/products/${p.handle}`,
        description: stripHtml(p.body_html),
      };
      try {
        items.push(normalize(raw));
      } catch (e) {
        console.warn(`  skip ${p.handle}: ${(e as Error).message}`);
      }
      if (limit && items.length >= limit) break;
    }
    if (limit && items.length >= limit) break;
    if (products.length < 250) break;
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
