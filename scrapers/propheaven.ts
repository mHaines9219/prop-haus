import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'propheaven' as const;
const BASE = 'https://www.propheaven.com';
const MENU_URL = `${BASE}/inc_cache/propheaven/categoryInventoryMenu2023a-325.js`;

// Extract category list from the JS menu document.write blob.
async function loadCategories(): Promise<Array<{ id: string; name: string; breadcrumb: string[] }>> {
  const js = await fetchHtml(MENU_URL);
  // The JS is one big document.write("...") with escaped HTML. Strip the JS wrapper and unescape.
  const inner = js
    .replace(/^[^"]*"/, '')
    .replace(/"\);?\s*$/, '')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n');
  const $ = cheerio.load(inner);
  const out: Array<{ id: string; name: string; breadcrumb: string[] }> = [];
  const seen = new Set<string>();
  $('a[href*="Scategory="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/Scategory=(\d+)/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    seen.add(id);
    const name = $(el).text().trim().replace(/\s+/g, ' ');
    if (!name) return;
    out.push({ id, name, breadcrumb: [name] });
  });
  return out;
}

async function listItemUrls(): Promise<Array<{ url: string; breadcrumb: string[] }>> {
  const cats = await loadCategories();
  console.log(`  propheaven: ${cats.length} categories`);
  const out: Array<{ url: string; breadcrumb: string[] }> = [];
  const seen = new Set<string>();
  for (const cat of cats) {
    // search_max=99999 returns the whole category in one page
    const listUrl = `${BASE}/?name=${encodeURIComponent(cat.name.replace(/\s+/g, '-'))}&Scategory=${cat.id}&search_max=99999`;
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
  // og:title is "Name in Category" — strip the trailing " in X" (also handle " - Propheaven.com")
  title = title.replace(/\s*-\s*Propheaven\.com$/i, '').trim();
  let name = title.replace(/\s+in\s+[^|]+$/i, '').trim();
  if (!name) name = $('h1').first().text().trim();
  if (!name) return null;
  const ogImg = $('meta[property="og:image"]').attr('content')?.trim();
  const detailed = $('#detailed_picture').attr('src')?.trim();
  const images = new Set<string>();
  if (ogImg && !/logo|spacer/i.test(ogImg)) images.add(ogImg);
  if (detailed) {
    // strip thumbnails_500_500 / thumbnails_200_200 to get full size
    const full = detailed.replace(/thumbnails_\d+_\d+\//g, '');
    const abs = full.startsWith('http') ? full : `${BASE}/${full.replace(/^\//, '')}`;
    images.add(abs);
  }
  const imgs = [...images].filter((u) => /^https?:\/\//.test(u));
  if (imgs.length === 0) return null;
  let description = $('meta[property="og:description"]').attr('content')?.trim()
    || $('meta[name="description"]').attr('content')?.trim();
  if (description && /^one of the best prop houses$/i.test(description)) description = undefined;
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
