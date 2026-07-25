import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Catalog, type CardItem, type PropItem } from './types';

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

export async function loadCatalog(): Promise<PropItem[]> {
  if (cached) return cached;
  const file = path.join(process.cwd(), 'data', 'catalog.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = Catalog.parse(JSON.parse(raw));
    cached = parsed;
    return parsed;
  } catch {
    cached = [];
    return [];
  }
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
