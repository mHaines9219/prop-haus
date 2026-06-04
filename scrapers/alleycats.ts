import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'alleycats' as const;
const BASE = 'https://www.alleycatsprops.com';
const MENU_URL = `${BASE}/inc_cache/alley/categoryMenuFromText-2.js`;

// Alley Cats categories use string slugs as Scategory values (e.g. "Lighting", "Benches+%2F+Chairs").
async function loadCategories(): Promise<Array<{ slug: string; name: string; breadcrumb: string[] }>> {
  const js = await fetchHtml(MENU_URL);
  const inner = js
    .replace(/^[^"]*"/, '')
    .replace(/"\);?\s*$/, '')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n');
  const $ = cheerio.load(inner);
  const out: Array<{ slug: string; name: string; breadcrumb: string[] }> = [];
  const seen = new Set<string>();
  $('a[href*="Scategory="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/Scategory=([^&]+)/);
    if (!m) return;
    const slug = decodeURIComponent(m[1].replace(/\+/g, ' '));
    if (seen.has(slug)) return;
    seen.add(slug);
    const name = $(el).text().trim().replace(/\s+/g, ' ');
    if (!name) return;
    // breadcrumb: split on " > " or "/" if the slug encodes a subcategory chain
    const crumbs = slug.split(/\s*>\s*/).map((s) => s.trim()).filter(Boolean);
    out.push({ slug, name, breadcrumb: crumbs.length ? crumbs : [name] });
  });
  return out;
}

async function listItemUrls(): Promise<Array<{ url: string; breadcrumb: string[] }>> {
  const cats = await loadCategories();
  console.log(`  alleycats: ${cats.length} categories`);
  const out: Array<{ url: string; breadcrumb: string[] }> = [];
  const seen = new Set<string>();
  for (const cat of cats) {
    const listUrl = `${BASE}/?name=${encodeURIComponent(cat.name.replace(/\s+/g, '-'))}&Scategory=${encodeURIComponent(cat.slug)}&search_max=99999`;
    let html: string;
    try { html = await fetchHtml(listUrl); } catch (e) { console.warn(`  cat ${cat.name}: ${(e as Error).message}`); continue; }
    const $ = cheerio.load(html);
    let added = 0;
    $('a[href*="product="]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/product=(\d+)/);
      if (!m) return;
      const url = href.startsWith('http') ? href : `${BASE}/${href.replace(/^\//, '')}`;
      const key = m[1];
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ url, breadcrumb: cat.breadcrumb });
      added++;
    });
    if (added) console.log(`  ${cat.name}: +${added}`);
  }
  return out;
}

async function parseItem(url: string, breadcrumb: string[]): Promise<RawItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  let title = $('meta[property="og:title"]').attr('content')?.trim() || '';
  // og:title is "Name in Category" — strip the trailing " in X"
  let name = title.replace(/\s+in\s+[^|]+$/i, '').trim();
  if (!name) name = $('h1').first().text().trim() || $('a.bold').first().text().trim();
  if (!name) return null;
  const ogImg = $('meta[property="og:image"]').attr('content')?.trim();
  const detailed = $('#detailed_picture').attr('src')?.trim();
  const images = new Set<string>();
  if (ogImg && !/logo|spacer/i.test(ogImg)) images.add(ogImg);
  if (detailed) {
    const full = detailed.replace(/thumbnails_\d+_\d+\//g, '');
    const abs = full.startsWith('http') ? full : `${BASE}/${full.replace(/^\//, '')}`;
    images.add(abs);
  }
  const imgs = [...images].filter((u) => /^https?:\/\//.test(u));
  if (imgs.length === 0) return null;
  let description = $('meta[property="og:description"]').attr('content')?.trim()
    || $('meta[name="description"]').attr('content')?.trim();
  if (description && /Serving the TV and Film Industry/i.test(description)) description = undefined;
  const m = url.match(/product=(\d+)/);
  const sourceId = m ? m[1] : url.replace(/[^a-z0-9]/gi, '-');
  return { source: SOURCE, sourceId, name, sourceCategoryPath: breadcrumb, images: imgs, sourceUrl: url, description };
}

async function main() {
  const limit = parseLimitArg();
  let urls = await listItemUrls();
  console.log(`Total candidate items: ${urls.length}`);
  if (limit) urls = urls.slice(0, limit);
  const items = [];
  let n = 0;
  for (const { url, breadcrumb } of urls) {
    n++;
    try {
      const raw = await parseItem(url, breadcrumb);
      if (raw) items.push(normalize(raw));
      if (n % 50 === 0) console.log(`  parsed ${n}/${urls.length}`);
    } catch (e) { console.warn(`  skip ${url}: ${(e as Error).message}`); }
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => { console.error(e); process.exit(1); });
