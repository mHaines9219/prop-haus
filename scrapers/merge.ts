/**
 * Merge scraped per-source JSON files into data/catalog.json.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Catalog, SOURCES, type PropItem } from '../lib/types';

const DATA = path.join(process.cwd(), 'data');

async function readSource(name: string): Promise<PropItem[]> {
  const file = path.join(DATA, `${name}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return Catalog.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function main() {
  const all: PropItem[] = [];
  for (const s of SOURCES) {
    const items = await readSource(s);
    if (items.length) console.log(`  ${s}: ${items.length}`);
    all.push(...items);
  }
  const byId = new Map<string, PropItem>();
  for (const item of all) byId.set(item.id, item);
  const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(path.join(DATA, 'catalog.json'), JSON.stringify(merged, null, 2), 'utf8');

  const counts: Record<string, number> = {};
  for (const item of merged) counts[item.category] = (counts[item.category] ?? 0) + 1;
  console.log(`\nMerged ${merged.length} items into data/catalog.json`);
  console.log('By category:');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
