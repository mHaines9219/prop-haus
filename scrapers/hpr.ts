import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

// Hand Prop Room (HPR). The "catalog" pages on hpr.com are image galleries —
// there are no individual product detail pages, only WordPress media uploads.
// We treat each gallery image as a discrete item, deriving the name from the
// filename and the breadcrumb from the category slug.
// TODO: HPR mentions their online gallery is only a slice of inventory; deeper
// coverage would require an internal feed / vendor relationship.

const SOURCE = 'hpr' as const;
const BASE = 'https://www.hpr.com';
const CATALOG_INDEX = `${BASE}/props/catalog/`;

// Cap to top categories to keep runtime manageable.
const MAX_CATEGORIES = 15;

function titleize(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nameFromImageUrl(url: string): string {
  const m = url.match(/\/([^/]+?)(?:-\d+x\d+)?\.(?:jpe?g|png|webp)(?:\?.*)?$/i);
  if (!m) return '';
  // Strip trailing -123 (WP duplicate suffix) and digits
  const base = m[1].replace(/-\d+$/, '');
  return titleize(base);
}

function isLikelyLogoOrChrome(url: string): boolean {
  return /\/(hpr-logo|favicon|sprite|placeholder)/i.test(url);
}

async function listCategories(): Promise<Array<{ url: string; breadcrumb: string[] }>> {
  const html = await fetchHtml(CATALOG_INDEX);
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: Array<{ url: string; breadcrumb: string[] }> = [];
  $('a[href*="/props/catalog/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!/\/props\/catalog\/[^/]+\/?$/.test(href)) return;
    const url = href.endsWith('/') ? href : href + '/';
    if (url === CATALOG_INDEX) return;
    if (seen.has(url)) return;
    seen.add(url);
    const slug = url.replace(/\/$/, '').split('/').pop() || '';
    out.push({ url, breadcrumb: ['Props', titleize(slug)] });
  });
  return out;
}

async function parseCategory(
  url: string,
  breadcrumb: string[],
): Promise<RawItem[]> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: RawItem[] = [];

  $('img, a').each((_, el) => {
    const $el = $(el);
    const candidates = [
      $el.attr('src'),
      $el.attr('data-src'),
      $el.attr('data-lazy-src'),
      $el.attr('href'),
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (!/wp-content\/uploads\/.*\.(jpe?g|png|webp)(\?|$)/i.test(c)) continue;
      if (isLikelyLogoOrChrome(c)) continue;
      const abs = c.startsWith('http') ? c : `${BASE}${c}`;
      // Prefer full-size URL (strip -<w>x<h> sizing suffix WordPress adds)
      const full = abs.replace(/-\d+x\d+(\.(jpe?g|png|webp))/i, '$1');
      if (seen.has(full)) continue;
      seen.add(full);
      const name = nameFromImageUrl(full) || breadcrumb[breadcrumb.length - 1];
      // Derive a stable sourceId from filename + category
      const fileSlug = (full.match(/\/([^/]+)\.(?:jpe?g|png|webp)/i)?.[1] || full)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const catSlug = url.replace(/\/$/, '').split('/').pop() || 'misc';
      items.push({
        source: SOURCE,
        sourceId: `${catSlug}-${fileSlug}`,
        name,
        sourceCategoryPath: breadcrumb,
        images: [full],
        sourceUrl: url,
      });
    }
  });

  return items;
}

async function main() {
  const limit = parseLimitArg();
  const cats = (await listCategories()).slice(0, MAX_CATEGORIES);
  console.log(`HPR: ${cats.length} categories`);
  const all: RawItem[] = [];
  for (const cat of cats) {
    const items = await parseCategory(cat.url, cat.breadcrumb);
    console.log(`  ${cat.breadcrumb.join(' > ')}: ${items.length}`);
    all.push(...items);
    if (limit && all.length >= limit) break;
  }
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
