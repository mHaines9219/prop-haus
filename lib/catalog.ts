import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ZodIssue } from 'zod';
import { PropItem, type CardItem } from './types';

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

/** Group a rejected item under a key specific enough to name the culprit. */
function rejectionKey(issues: ZodIssue[]): string {
  const enumIssue = issues.find((i) => i.code === 'invalid_enum_value' && i.path[0] === 'source');
  if (enumIssue && 'received' in enumIssue) return `unknown source "${String(enumIssue.received)}"`;
  const first = issues[0];
  return first ? `${first.path.join('.') || '<root>'}: ${first.code}` : 'unknown';
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

  if (!Array.isArray(entries)) {
    console.error(`[catalog] ${file} is not an array — got ${typeof entries}`);
    cached = [];
    return [];
  }

  const items: PropItem[] = [];
  const rejected = new Map<string, number>();
  for (const entry of entries) {
    const result = PropItem.safeParse(entry);
    if (result.success) {
      items.push(result.data);
    } else {
      const key = rejectionKey(result.error.issues);
      rejected.set(key, (rejected.get(key) ?? 0) + 1);
    }
  }

  if (rejected.size > 0) {
    const total = [...rejected.values()].reduce((a, b) => a + b, 0);
    const breakdown = [...rejected.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${n}x ${reason}`)
      .join('; ');
    console.warn(
      `[catalog] dropped ${total} of ${entries.length} invalid items — ${breakdown}`,
    );
  }

  cached = items;
  return items;
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
