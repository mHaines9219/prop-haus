import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'depict33' as const;
const BASE = 'http://www.depict33.com';

// All Depict33 inventory lives on Squarespace gallery pages — no individual product URLs.
// Each <img class="thumb-image"> has an alt attribute containing the item name (plus optional price)
// and a stable data-image-id used as the source id.
const CATEGORIES: Array<{ path: string; breadcrumb: string[] }> = [
  { path: '/props-setdress', breadcrumb: ['Props & Set Dress'] },
  { path: '/shapes', breadcrumb: ['Shapes'] },
  { path: '/flooring', breadcrumb: ['Flooring'] },
  { path: '/flats', breadcrumb: ['Flats'] },
  { path: '/production-rentals', breadcrumb: ['Production Rentals'] },
];

function parseName(alt: string): string {
  // alt examples:
  //   "8" X 12" X 18.5" | APPLE BOXES | $40"
  //   "SMALL STOOL | $25"
  // Strip trailing $price segment, keep readable name.
  const parts = alt.split('|').map((s) => s.trim()).filter(Boolean);
  const noPrice = parts.filter((p) => !/^\$\s*\d/.test(p));
  if (noPrice.length === 0) return alt.trim();
  // Prefer the longest non-dimension-only segment, otherwise join.
  const named = noPrice.find((p) => /[a-zA-Z]{3,}/.test(p));
  return (named || noPrice.join(' | ')).trim();
}

async function main() {
  const limit = parseLimitArg();
  const items: ReturnType<typeof normalize>[] = [];
  const seen = new Set<string>();

  for (const cat of CATEGORIES) {
    let html: string;
    try {
      html = await fetchHtml(BASE + cat.path);
    } catch (e) {
      console.warn(`  skip ${cat.path}: ${(e as Error).message}`);
      continue;
    }
    const $ = cheerio.load(html);
    let added = 0;
    $('img.thumb-image').each((_, el) => {
      const img = $(el);
      const src = img.attr('data-image') || img.attr('data-src') || img.attr('src') || '';
      const alt = (img.attr('alt') || '').trim();
      const id = img.attr('data-image-id') || '';
      if (!src || !/^https?:\/\//.test(src) || !id || !alt) return;
      if (seen.has(id)) return;
      seen.add(id);
      const name = parseName(alt);
      if (!name) return;
      const raw: RawItem = {
        source: SOURCE,
        sourceId: id,
        name,
        sourceCategoryPath: cat.breadcrumb,
        images: [src],
        sourceUrl: `${BASE}${cat.path}`,
      };
      try {
        items.push(normalize(raw));
        added++;
      } catch (e) {
        // skip invalid
      }
      if (limit && items.length >= limit) return false;
    });
    console.log(`  ${cat.path}: +${added}`);
    if (limit && items.length >= limit) break;
  }

  await writeSource(SOURCE, items);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
