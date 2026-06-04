import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'omega' as const;
const BASE = 'https://omegacinemaprops.com';

// Omega Cinema Props uses a Drupal/Solr-backed catalog at /searchresults.
// Categories are facet params. Each listing card shows the product name + thumbnail inline,
// so we scrape everything from the listing pages — no per-detail fetches required.
const CATEGORY_INDEX: Array<{ facet: string; breadcrumb: string[] }> = [
  { facet: '01_Accessories', breadcrumb: ['Accessories'] },
  { facet: '02_Appliances', breadcrumb: ['Appliances'] },
  { facet: '03_Art', breadcrumb: ['Art', 'Artwork'] },
  { facet: '04_Columns/Pedestals', breadcrumb: ['Columns', 'Pedestals'] },
  { facet: '05_Drapery', breadcrumb: ['Drapery', 'Curtains'] },
  { facet: '06_Electronics', breadcrumb: ['Electronics'] },
  { facet: '06_Floor Screens', breadcrumb: ['Floor Screens'] },
  { facet: '07_Floral', breadcrumb: ['Floral', 'Plants'] },
  { facet: '08_Furniture-Bars', breadcrumb: ['Furniture', 'Bars'] },
  { facet: '09_Furniture-Seating', breadcrumb: ['Furniture', 'Seating'] },
  { facet: '10_Furniture-Beds', breadcrumb: ['Furniture', 'Beds'] },
  { facet: '11_Furniture-Cabinets', breadcrumb: ['Furniture', 'Cabinets', 'Storage'] },
  { facet: '12_Furniture-Desks', breadcrumb: ['Furniture', 'Desks'] },
  { facet: '13_Furniture-Office', breadcrumb: ['Furniture', 'Office'] },
  { facet: '14_Furniture-Tables', breadcrumb: ['Furniture', 'Tables'] },
  { facet: '15_Graphics', breadcrumb: ['Graphics', 'Signage'] },
  { facet: '16_Hardware', breadcrumb: ['Hardware', 'Industrial'] },
  { facet: '17_Lighting', breadcrumb: ['Lighting'] },
  { facet: '18_Linens', breadcrumb: ['Linens', 'Textiles'] },
  { facet: '19_Miscellaneous', breadcrumb: ['Miscellaneous'] },
  { facet: '20_Plumbing Fixtures', breadcrumb: ['Plumbing Fixtures', 'Hardware'] },
  { facet: '21_Rugs', breadcrumb: ['Rugs', 'Floor Coverings'] },
  { facet: '22_Sports & Fitness', breadcrumb: ['Sports & Fitness'] },
  { facet: '23_Wall Dressing', breadcrumb: ['Wall Dressing'] },
];

// Default page size on the server appears to be 30. The `per_page=60` override gets
// blocked with a 403 by Omega's WAF, so we leave it off.
const PER_PAGE = 30;

async function listAndParseAll(maxItems?: number): Promise<RawItem[]> {
  const out: RawItem[] = [];
  const seen = new Set<string>();
  for (const cat of CATEGORY_INDEX) {
    if (maxItems && out.length >= maxItems) break;
    const facetEnc = encodeURIComponent(cat.facet);
    for (let page = 1; page <= 1000; page++) {
      const url = `${BASE}/searchresults?page=${page}&categories%5B0%5D=${facetEnc}`;
      let html: string;
      try {
        html = await fetchHtml(url);
      } catch (e) {
        console.warn(`  fetch fail ${cat.facet} p${page}: ${(e as Error).message}`);
        break;
      }
      const $ = cheerio.load(html);

      // Each product card: thumbnail link + name link, both pointing to /detail/SKU
      // Walk image anchors and pair them with the descriptive text anchor that follows.
      const cards = new Map<string, { name: string; img: string }>();

      // Collect all detail links with text — the name links live in spans/text wrappers
      $('a[href*="/detail/"]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const m = href.match(/\/detail\/([^?#]+)/);
        if (!m) return;
        const sku = decodeURIComponent(m[1]);
        const text = $a.text().trim();
        const $img = $a.find('img').first();
        const imgSrc = $img.attr('src') || '';
        const existing = cards.get(sku) || { name: '', img: '' };
        if (text && text.length > existing.name.length) existing.name = text;
        if (imgSrc && !existing.img) existing.img = imgSrc;
        cards.set(sku, existing);
      });

      if (cards.size === 0) break;
      let added = 0;
      for (const [sku, { name, img }] of cards) {
        if (seen.has(sku)) continue;
        seen.add(sku);
        if (!name) continue;
        const images: string[] = [];
        if (img) {
          const full = img.startsWith('http') ? img : `${BASE}${img}`;
          if (!/no-picture\.png$/i.test(full)) images.push(full);
        }
        // Skip items with no real image — they're placeholder records
        if (images.length === 0) continue;
        out.push({
          source: SOURCE,
          sourceId: sku,
          name,
          sourceCategoryPath: cat.breadcrumb,
          images,
          sourceUrl: `${BASE}/detail/${encodeURIComponent(sku)}`,
        });
        added++;
      }
      console.log(`  ${cat.facet} page ${page}: +${added} (total ${out.length})`);
      if (maxItems && out.length >= maxItems) break;
      // If page returned fewer than PER_PAGE unique cards, assume end.
      if (cards.size < PER_PAGE) break;
    }
  }
  return out;
}

async function main() {
  const limit = parseLimitArg();
  let raws = await listAndParseAll(limit);
  console.log(`Total raw items: ${raws.length}`);
  if (limit) raws = raws.slice(0, limit);
  const items = [];
  for (const r of raws) {
    try {
      items.push(normalize(r));
    } catch (e) {
      console.warn(`  skip ${r.sourceId}: ${(e as Error).message}`);
    }
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
