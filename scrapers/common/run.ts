import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PropItem, type Source } from '../../lib/types';
import { mapToUnifiedCategory } from '../../lib/categories';
import { vendorRef } from '../../lib/vendors';

export type RawItem = {
  source: Source;
  sourceId: string;
  name: string;
  sourceCategoryPath: string[];
  images: string[];
  sourceUrl: string;
  description?: string;
  dimensions?: { width?: number; depth?: number; height?: number };
};

export function normalize(raw: RawItem) {
  const item = {
    id: `${raw.source}:${raw.sourceId}`,
    source: raw.source,
    sourceId: raw.sourceId,
    name: raw.name,
    description: raw.description,
    category: mapToUnifiedCategory(raw.sourceCategoryPath.concat([raw.name])),
    subcategory: raw.sourceCategoryPath[raw.sourceCategoryPath.length - 1],
    sourceCategoryPath: raw.sourceCategoryPath,
    dimensions: raw.dimensions ? { ...raw.dimensions, unit: 'in' as const } : undefined,
    vendor: vendorRef(raw.source),
    images: raw.images.filter((u) => /^https?:\/\//.test(u)),
    sourceUrl: raw.sourceUrl,
    scrapedAt: new Date().toISOString(),
  };
  return PropItem.parse(item);
}

export async function writeSource(source: string, items: ReturnType<typeof normalize>[]) {
  const dir = path.join(process.cwd(), 'data');
  await fs.mkdir(dir, { recursive: true });
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(path.join(dir, `${source}.json`), JSON.stringify(sorted, null, 2), 'utf8');
  console.log(`Wrote data/${source}.json (${sorted.length} items)`);
}
