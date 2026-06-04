import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Catalog, type PropItem } from './types';

let cached: PropItem[] | null = null;

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
