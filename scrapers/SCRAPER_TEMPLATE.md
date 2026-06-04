# Scraper template (for any new LA vendor)

Each vendor scraper lives at `scrapers/{sourceId}.ts` and emits `data/{sourceId}.json` via `writeSource`. Conform to `RawItem` from `scrapers/common/run.ts` — the `normalize()` helper takes care of category mapping, vendor ref, and PropItem validation.

## Source IDs (must match `lib/types.ts` SOURCES)

`gilandroy, hpr, platinum, omega, artdimensions, ec, heritage, formdecor, historyforhire, propheaven, target, rcvintage, universal, propserviceswest, pina, warnerbros, objects, alleycats, alpha, depict33, iss, premiere, shagcarpet`

## Skeleton

```ts
import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'omega' as const; // <-- replace per vendor; must be in SOURCES
const BASE = 'https://omegacinemaprops.com';

const CATEGORY_INDEX: Array<{ path: string; breadcrumb: string[] }> = [
  // { path: '/category/lighting', breadcrumb: ['Lighting'] },
];

async function listItemUrls(): Promise<Array<{ url: string; breadcrumb: string[] }>> {
  const out: Array<{ url: string; breadcrumb: string[] }> = [];
  const seen = new Set<string>();
  for (const cat of CATEGORY_INDEX) {
    for (let page = 1; ; page++) {
      const listUrl = `${BASE}${cat.path}${page > 1 ? `?page=${page}` : ''}`;
      let html: string;
      try { html = await fetchHtml(listUrl); } catch { break; }
      const $ = cheerio.load(html);
      let added = 0;
      $('a[href*="/product/"]').each((_, el) => {
        const href = $(el).attr('href'); if (!href) return;
        const url = href.startsWith('http') ? href : `${BASE}${href}`;
        if (seen.has(url)) return;
        seen.add(url); out.push({ url, breadcrumb: cat.breadcrumb }); added++;
      });
      if (added === 0) break;
    }
  }
  return out;
}

async function parseItem(url: string, breadcrumb: string[]): Promise<RawItem | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';
  if (!name) return null;
  const images = [...new Set($('img').map((_, el) => $(el).attr('src') || '').get())]
    .filter((s) => /^https?:\/\//.test(s));
  if (images.length === 0) return null;
  const description = $('meta[name="description"]').attr('content')?.trim();
  const m = url.match(/\/product\/([^/?#]+)/);
  const sourceId = m ? m[1] : url.replace(/[^a-z0-9]/gi, '-');
  return { source: SOURCE, sourceId, name, sourceCategoryPath: breadcrumb, images, sourceUrl: url, description };
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
      if (n % 20 === 0) console.log(`  parsed ${n}/${urls.length}`);
    } catch (e) { console.warn(`  skip ${url}: ${(e as Error).message}`); }
  }
  await writeSource(SOURCE, items);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Conventions

- Use `fetchHtml` (cached, rate-limited). Don't add `axios` etc.
- Be tolerant: `if (!name) return null;` is fine — let merge dedupe.
- Run with `--limit 5` while iterating: `npx tsx scrapers/omega.ts --limit 5`.
- Final run: no limit. Output goes to `data/{source}.json`.
- For sites with login walls / 403 / phone-only, **write a stub that emits an empty array** and a `// TODO:` comment naming the blocker. Don't fake data.
- For sites that gate full size images behind clicks, scrape thumb URLs — better than nothing.

## After all scrapers run

```
pnpm scrape:merge      # builds data/catalog.json
pnpm enrich            # adds style/era/materials/...
pnpm embed             # builds data/embeddings.f32
```
