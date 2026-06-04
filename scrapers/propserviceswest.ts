import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'propserviceswest' as const;
const BASE = 'https://propserviceswest.com';

async function listItemUrlsForPage(page: number): Promise<string[]> {
  const url = page === 1 ? `${BASE}/shop/` : `${BASE}/shop/page/${page}/`;
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $('a[href*="/product/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const u = href.startsWith('http') ? href : `${BASE}${href}`;
    const m = u.match(/^(https?:\/\/[^/]+\/product\/[^/?#]+\/?)/);
    if (m) out.add(m[1]);
  });
  return Array.from(out);
}

async function parseItem(url: string): Promise<RawItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const name =
    $('h1.product_title').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    '';
  if (!name) return null;

  // Breadcrumb category path
  const breadcrumb: string[] = [];
  $('.woocommerce-breadcrumb a, nav.woocommerce-breadcrumb a').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (text && /product-category/.test(href)) breadcrumb.push(text);
  });
  if (breadcrumb.length === 0) {
    $('.posted_in a').each((_, el) => {
      const t = $(el).text().trim();
      if (t) breadcrumb.push(t);
    });
  }
  if (breadcrumb.length === 0) breadcrumb.push('Shop');

  const images = new Set<string>();
  $('.woocommerce-product-gallery img, figure img, .images img').each((_, el) => {
    const src =
      $(el).attr('data-large_image') ||
      $(el).attr('data-src') ||
      $(el).attr('src') ||
      '';
    if (src && /^https?:\/\//.test(src) && /wp-content\/uploads/.test(src)) {
      // Strip resizing query like ?fit=...
      images.add(src.split('?')[0]);
    }
  });
  if (images.size === 0) {
    const og = $('meta[property="og:image"]').attr('content');
    if (og && /^https?:\/\//.test(og)) images.add(og.split('?')[0]);
  }
  if (images.size === 0) return null;

  const description =
    $('.woocommerce-product-details__short-description').text().trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    undefined;

  const slug = url.match(/\/product\/([^/?#]+)/)?.[1] || url;
  return {
    source: SOURCE,
    sourceId: slug,
    name,
    sourceCategoryPath: breadcrumb,
    images: Array.from(images),
    sourceUrl: url,
    description,
  };
}

async function main() {
  const limit = parseLimitArg();
  const urls: string[] = [];
  const seen = new Set<string>();

  // PSW reports ~16,464 items across ~1029 pages of 16. Cap at 1100 for safety.
  for (let page = 1; page <= 1100; page++) {
    const pageUrls = await listItemUrlsForPage(page);
    let added = 0;
    for (const u of pageUrls) {
      if (seen.has(u)) continue;
      seen.add(u);
      urls.push(u);
      added++;
    }
    if (page % 25 === 0) console.log(`  listed page ${page}, total urls=${urls.length}`);
    if (added === 0) break;
    if (limit && urls.length >= limit) break;
  }

  console.log(`Total candidate items: ${urls.length}`);
  const work = limit ? urls.slice(0, limit) : urls;
  const items: ReturnType<typeof normalize>[] = [];
  let n = 0;
  for (const url of work) {
    n++;
    try {
      const raw = await parseItem(url);
      if (raw) items.push(normalize(raw));
    } catch (e) {
      console.warn(`  skip ${url}: ${(e as Error).message}`);
    }
    if (n % 100 === 0) console.log(`  parsed ${n}/${work.length}`);
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
