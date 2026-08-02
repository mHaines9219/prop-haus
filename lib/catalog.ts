import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describeRejections, parseCatalogItems } from './catalog-parse';
import type { PropItem, CardItem } from './types';

let cached: PropItem[] | null = null;

/**
 * Project a full item down to just the fields the grid/cards render (first
 * image only). List endpoints map through this to keep responses small — the
 * item detail page still loads the full PropItem when a user opens one.
 */
export function toCardItem(item: PropItem): CardItem {
  return {
    id: item.id,
    source: item.source,
    sourceId: item.sourceId,
    name: item.name,
    subcategory: item.subcategory,
    images: item.images.slice(0, 1),
  };
}

/**
 * Load and validate the scraped catalog.
 *
 * Validation is PER ITEM, deliberately. `Catalog.parse()` over the whole array
 * fails the entire load on a single bad record — which is how a scrape that
 * introduced two vendors missing from the `SOURCES` enum silently zeroed out all
 * ~96k items: the throw was swallowed and every caller saw a legitimately empty
 * catalog. A bad scrape of one vendor should cost us that vendor, not the
 * inventory.
 *
 * Rejects are counted and logged with the reason. An empty return now means the
 * file is genuinely unreadable, and says so.
 *
 * The validation itself lives in `lib/catalog-parse.ts` because four pipeline
 * scripts parse this same file and needed the same treatment. This caller is
 * the LENIENT one: a running app must not go blank because one vendor's scrape
 * regressed. The pipeline uses the strict form and refuses to proceed.
 */
export async function loadCatalog(): Promise<PropItem[]> {
  if (cached) return cached;
  const file = path.join(process.cwd(), 'data', 'catalog.json');

  let entries: unknown;
  try {
    entries = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    console.error(`[catalog] cannot read ${file}: ${(err as Error).message}`);
    cached = [];
    return [];
  }

  const report = parseCatalogItems(entries);
  const summary = describeRejections(report, 'catalog');
  if (summary) console.warn(summary);

  cached = report.items;
  return report.items;
}

export async function getByCategory(slug: string): Promise<PropItem[]> {
  const all = await loadCatalog();
  return all.filter((i) => i.category === slug);
}

export async function getItem(source: string, sourceId: string): Promise<PropItem | undefined> {
  const all = await loadCatalog();
  return all.find((i) => i.source === source && i.sourceId === sourceId);
}

export async function categoryCounts(): Promise<Record<string, number>> {
  const all = await loadCatalog();
  const counts: Record<string, number> = {};
  for (const item of all) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }
  return counts;
}
