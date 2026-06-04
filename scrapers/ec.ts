import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'ec' as const;
const BASE = 'https://ecprops.com';

// E.C. Props (North Hollywood) runs a flat static site. inventory.html lists every category
// page (products/<cat>/<sub>.html). Each category page renders a grid of products as
// <a href="<slug>.html"><img src="../../img/<cat>/<slug>.jpg"><p>CODE<br>Subtitle</p></a>.
// Detail pages contain little extra info, so we scrape directly from category pages.

async function listCategoryUrls(): Promise<string[]> {
  const html = await fetchHtml(`${BASE}/inventory.html`);
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href^="products/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/\.html$/.test(href)) urls.add(`${BASE}/${href}`);
  });
  return [...urls];
}

function breadcrumbFromCategoryUrl(url: string): string[] {
  // /products/<cat>/<sub>.html  or  /products/<cat>/<sub>/<file>.html
  const m = url.match(/\/products\/(.+?)\.html$/);
  if (!m) return ['EC Props'];
  const titlecase = (s: string) =>
    s.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  const parts = m[1].split('/').filter(Boolean);
  return parts.map(titlecase);
}

function parseCategoryPage(catUrl: string, html: string, breadcrumb: string[]): RawItem[] {
  const $ = cheerio.load(html);
  const out: RawItem[] = [];
  const seen = new Set<string>();

  // Each product is a `.col-sm-4` cell with an <img> + <p>CODE<br>subtitle</p>.
  $('div.col-sm-4').each((_, el) => {
    const $cell = $(el);
    const $img = $cell.find('img').first();
    const imgSrc = $img.attr('src') || '';
    if (!imgSrc) return;

    // Skip the index/back navigation cells (no real product code)
    const $p = $cell.find('p').first();
    const pHtml = $p.html() || '';
    if (!pHtml) return;

    // Convert <br> to newline, strip <small>...</small> ("Click for Details")
    const lines = pHtml
      .replace(/<small[^>]*>[\s\S]*?<\/small>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const code = lines[0];
    const subtitle = lines.slice(1).join(' ').trim();

    // A real product code looks like "C-0462" or "F-0087M"
    if (!/^[A-Z]+[-\s]?\d+[A-Z]*$/i.test(code)) return;

    if (seen.has(code)) return;
    seen.add(code);

    // Build absolute image URL from category page URL + relative src
    const imgAbs = new URL(imgSrc, catUrl).toString();
    const $a = $cell.find('a').first();
    const href = $a.attr('href') || '';
    const detailUrl = href ? new URL(href, catUrl).toString() : catUrl;

    const name = subtitle ? `${code} ${subtitle}` : code;

    out.push({
      source: SOURCE,
      sourceId: code.replace(/\s+/g, '-'),
      name,
      sourceCategoryPath: breadcrumb,
      images: [imgAbs],
      sourceUrl: detailUrl,
      description: subtitle || undefined,
    });
  });
  return out;
}

async function main() {
  const limit = parseLimitArg();
  const catUrls = await listCategoryUrls();
  console.log(`Total category pages: ${catUrls.length}`);
  const all: RawItem[] = [];
  const seenIds = new Set<string>();
  let n = 0;
  for (const catUrl of catUrls) {
    n++;
    try {
      const html = await fetchHtml(catUrl);
      const bc = breadcrumbFromCategoryUrl(catUrl);
      const items = parseCategoryPage(catUrl, html, bc);
      for (const it of items) {
        if (seenIds.has(it.sourceId)) continue;
        seenIds.add(it.sourceId);
        all.push(it);
      }
      if (n % 20 === 0) console.log(`  cat ${n}/${catUrls.length} (items so far: ${all.length})`);
    } catch (e) {
      console.warn(`  skip ${catUrl}: ${(e as Error).message}`);
    }
  }
  console.log(`Total raw items: ${all.length}`);
  let raws = all;
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
