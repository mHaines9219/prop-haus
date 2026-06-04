import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'shagcarpet' as const;
const BASE = 'https://www.shagcarpetprops.com';

// Shag Carpet runs Volusion. The category pages render product listings via JS, but the
// sitemap.xml exposes every product URL (pattern: /<slug>-p/<id>.htm). We enumerate from
// the sitemap and parse each detail page.
//
// NOTE: Shag Carpet is Dallas-based, not LA. Including it because the source ID was
// requested and the platform may eventually serve multi-city inventory.

async function listProductUrls(): Promise<string[]> {
  const xml = await fetchHtml(`${BASE}/sitemap.xml`);
  const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  const urls: string[] = [];
  for (const m of matches) {
    const url = m.replace(/<\/?loc>/g, '').trim();
    if (/-p\/\d+\.htm$/.test(url)) urls.push(url);
  }
  return urls;
}

async function parseItem(url: string): Promise<RawItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const name =
    $('[itemprop="name"]').first().text().trim() ||
    $('h1.vp-product-title').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    '';
  if (!name) return null;

  // Photos live at /v/vspfiles/photos/<id>-Ns.png / -NT.png / -N.png (full)
  const imgs = new Set<string>();
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (/\/v\/vspfiles\/photos\//.test(src)) {
      // Normalize to the largest variant. Filenames look like 10732-2T.png or 10732-2S.png.
      // The non-suffixed "10732-2.png" is the full size.
      const full = src.replace(/(-\d+)[TS](\.(?:png|jpe?g|webp))/i, '$1$2').split('?')[0];
      const abs = full.startsWith('http') ? full : `${BASE}${full}`;
      imgs.add(abs);
    }
  });
  const images = [...imgs];
  if (images.length === 0) return null;

  const description =
    $('[itemprop="description"]').first().text().trim().replace(/\s+/g, ' ') || undefined;

  // Real breadcrumb lives in <td class="vCSS_breadcrumb_td">. Anchors there go
  // Home > <Top Category> > <Subcategory>.
  const breadcrumb: string[] = [];
  $('td.vCSS_breadcrumb_td a').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 60 && !breadcrumb.includes(t)) breadcrumb.push(t);
  });
  const cleaned = breadcrumb
    .filter((b) => !/^(home|shag|all|new|featured)$/i.test(b))
    .slice(0, 3);

  // Fallback breadcrumb so downstream category mapping has signal
  const sourceCategoryPath = cleaned.length > 0 ? cleaned : ['Props'];

  // Dimensions sometimes appear as "Height X" Width Y" Depth Z""
  let dimensions: RawItem['dimensions'];
  const body = $('body').text();
  const h = body.match(/Height[:\s]+(\d+(?:\.\d+)?)\s*["']?/i);
  const w = body.match(/Width[:\s]+(\d+(?:\.\d+)?)\s*["']?/i);
  const d = body.match(/Depth[:\s]+(\d+(?:\.\d+)?)\s*["']?/i);
  if (h || w || d) {
    dimensions = {
      ...(w ? { width: Number(w[1]) } : {}),
      ...(d ? { depth: Number(d[1]) } : {}),
      ...(h ? { height: Number(h[1]) } : {}),
    };
  }

  const m = url.match(/\/([^/]+)-p\/(\d+)\.htm$/);
  const sourceId = m ? m[2] : url;

  return {
    source: SOURCE,
    sourceId,
    name,
    sourceCategoryPath,
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
