import * as cheerio from 'cheerio';
import { fetchHtml, parseLimitArg } from './common/fetch';
import { normalize, writeSource, type RawItem } from './common/run';

const SOURCE = 'premiere' as const;
const BASE = 'https://www.premiereprops.net';

// Categories discovered from /inventory navigation (Squarespace 7.0 galleries).
const CATEGORIES: Array<{ slug: string; title: string }> = [
  { slug: 'barn', title: 'Barn' },
  { slug: 'bars', title: 'Bars & Saloons' },
  { slug: 'beds', title: 'Beds' },
  { slug: 'benches', title: 'Benches' },
  { slug: 'bicycles', title: 'Bicycles' },
  { slug: 'boats', title: 'Boats' },
  { slug: 'books-faux', title: 'Books (Faux)' },
  { slug: 'cages', title: 'Cages' },
  { slug: 'camping', title: 'Camping' },
  { slug: 'carts', title: 'Carts' },
  { slug: 'crates', title: 'Crates' },
  { slug: 'egyptian', title: 'Egyptian' },
  { slug: 'hot-air-balloon', title: 'Hot Air Balloon' },
  { slug: 'library', title: 'Library' },
  { slug: 'medical', title: 'Medical' },
  { slug: 'nautical-ropes', title: 'Nautical - Ropes & Pulleys' },
  { slug: 'school-desks', title: 'School Desks' },
  { slug: 'stagecoach', title: 'Stagecoach' },
  { slug: 'stoves', title: 'Stoves' },
  { slug: 'tables', title: 'Tables' },
  { slug: 'taxidermy', title: 'Taxidermy' },
  { slug: 'tents', title: 'Tents' },
  { slug: 'tools', title: 'Tools' },
  { slug: 'water-pumps', title: 'Water Pumps' },
  { slug: 'westernprops', title: 'Western Props' },
];

type SquarespaceItem = {
  id: string;
  title?: string;
  filename?: string;
  body?: string;
  excerpt?: string;
  fullUrl?: string;
  assetUrl?: string;
  urlId?: string;
  recordType?: number;
};

function titleFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  const cleaned = base
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = cheerio.load(s).text().replace(/\s+/g, ' ').trim();
  return text || undefined;
}

async function fetchGallery(slug: string): Promise<SquarespaceItem[]> {
  const all: SquarespaceItem[] = [];
  let offset = 0;
  for (;;) {
    const url = `${BASE}/${slug}?format=json-pretty${offset > 0 ? `&offset=${offset}` : ''}`;
    let body: string;
    try {
      body = await fetchHtml(url);
    } catch {
      break;
    }
    let json: { items?: SquarespaceItem[] };
    try {
      json = JSON.parse(body);
    } catch {
      break;
    }
    const items = json.items || [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < 15) break;
    offset += items.length;
    if (offset > 5000) break; // safety
  }
  return all;
}

async function main() {
  const limit = parseLimitArg();
  const out: ReturnType<typeof normalize>[] = [];
  const seen = new Set<string>();

  for (const cat of CATEGORIES) {
    let items: SquarespaceItem[];
    try {
      items = await fetchGallery(cat.slug);
    } catch (e) {
      console.warn(`  skip ${cat.slug}: ${(e as Error).message}`);
      continue;
    }
    console.log(`  ${cat.slug}: ${items.length} items`);
    let idx = 0;
    for (const it of items) {
      idx++;
      const rawName = (it.title && it.title.trim()) || titleFromFilename(it.filename);
      // Filenames on this site are often just "1.JPG", "4-5.JPG" — useless
      // as names. Prefix with the category so the item has at least some
      // searchable meaning ("Barn #1", "Bars & Saloons #4-5").
      const looksLikeIndexOnly = !!rawName && /^[\d\s\-_.]+$/.test(rawName);
      const name = !rawName || looksLikeIndexOnly
        ? `${cat.title} #${rawName || idx}`
        : rawName;
      const sourceId = it.urlId || it.id;
      if (!sourceId || seen.has(sourceId)) continue;
      seen.add(sourceId);
      const images: string[] = [];
      if (it.assetUrl && /^https?:\/\//.test(it.assetUrl)) images.push(it.assetUrl);
      if (images.length === 0) continue;
      const sourceUrl = it.fullUrl ? `${BASE}${it.fullUrl}` : `${BASE}/${cat.slug}`;
      const raw: RawItem = {
        source: SOURCE,
        sourceId,
        name,
        sourceCategoryPath: [cat.title],
        images,
        sourceUrl,
        description: stripHtml(it.body) || stripHtml(it.excerpt),
      };
      try {
        out.push(normalize(raw));
      } catch (e) {
        console.warn(`  skip ${sourceId}: ${(e as Error).message}`);
      }
      if (limit && out.length >= limit) break;
    }
    if (limit && out.length >= limit) break;
  }

  await writeSource(SOURCE, out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
