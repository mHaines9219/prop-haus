import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'formdecor' as const;
const BASE = 'https://formdecor.com';

// FormDecor is a WordPress/WooCommerce site. We use the product sitemaps to enumerate
// every product URL, then parse each detail page for name, images, description, dims.

const PRODUCT_SITEMAPS = [
  `${BASE}/product-sitemap.xml`,
  `${BASE}/product-sitemap2.xml`,
  `${BASE}/product-sitemap3.xml`,
];

async function listProductUrls(): Promise<string[]> {
  const seen = new Set<string>();
  for (const sm of PRODUCT_SITEMAPS) {
    let xml: string;
    try {
      xml = await fetchHtml(sm);
    } catch (e) {
      console.warn(`  sitemap fail ${sm}: ${(e as Error).message}`);
      continue;
    }
    const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
    for (const m of matches) {
      const url = m.replace(/<\/?loc>/g, '').trim();
      // Product detail URLs look like /products/<cat>/<sub>/<slug>/
      if (/\/products\/[^/]+\/[^/]+\/[^/]+\/?$/.test(url)) seen.add(url);
    }
  }
  return [...seen];
}

function breadcrumbFromUrl(url: string): string[] {
  const m = url.match(/\/products\/([^/]+)\/([^/]+)\//);
  if (!m) return ['FormDecor'];
  const titlecase = (s: string) =>
    s.replace(/-rental$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return [titlecase(m[1]), titlecase(m[2])];
}

async function parseItem(url: string): Promise<RawItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const name =
    $('h1.product_title').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.replace(/\s*-\s*FormDecor.*$/i, '').trim() ||
    '';
  if (!name) return null;

  // Gather images — prefer full-size from <a href> wrapping thumbnails, fall back to og:image
  const imgs = new Set<string>();
  $('a[data-large_image], a.woocommerce-product-gallery__image').each((_, el) => {
    const $a = $(el);
    const full = $a.attr('data-large_image') || $a.attr('href') || '';
    if (full && /\.(jpe?g|png|webp)/i.test(full)) imgs.add(full);
  });
  $('img').each((_, el) => {
    const src =
      $(el).attr('data-large_image') ||
      $(el).attr('data-src') ||
      $(el).attr('src') ||
      '';
    if (src && /wp-content\/uploads/.test(src) && /\.(jpe?g|png|webp)/i.test(src)) {
      // Strip size suffix (-450x450) to get the original
      const full = src.replace(/-\d+x\d+(?=\.(jpe?g|png|webp))/i, '');
      imgs.add(full);
    }
  });
  const og = $('meta[property="og:image"]').attr('content');
  if (og) imgs.add(og);

  const images = [...imgs].filter((u) => /^https?:\/\//.test(u));
  if (images.length === 0) return null;

  const description =
    $('.woocommerce-product-details__short-description').text().trim() ||
    $('#tab-description').text().trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    undefined;

  // Try to grab dimensions from a "Dimensions" row (e.g., "30 × 40 × 31 in")
  let dimensions: RawItem['dimensions'];
  const dimText = $('th:contains("Dimensions"), .product_meta:contains("Dimensions")').next().text();
  const dm = dimText.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/i);
  if (dm) dimensions = { width: Number(dm[1]), depth: Number(dm[2]), height: Number(dm[3]) };

  const slugMatch = url.match(/\/products\/[^/]+\/[^/]+\/([^/]+)\/?$/);
  const sourceId = slugMatch ? slugMatch[1] : url.replace(/[^a-z0-9]/gi, '-');

  return {
    source: SOURCE,
    sourceId,
    name,
    sourceCategoryPath: breadcrumbFromUrl(url),
    images,
    sourceUrl: url,
    description,
    dimensions,
  };
}

async function main() {
  const limit = parseLimitArg();
  let urls = await listProductUrls();
  console.log(`Total candidate items: ${urls.length}`);
  if (limit) urls = urls.slice(0, limit);
  const items = [];
  let n = 0;
  for (const url of urls) {
    n++;
    try {
      const raw = await parseItem(url);
      if (raw) items.push(normalize(raw));
      if (n % 50 === 0) console.log(`  parsed ${n}/${urls.length}`);
    } catch (e) {
      console.warn(`  skip ${url}: ${(e as Error).message}`);
    }
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
