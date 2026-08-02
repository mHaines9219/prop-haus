/**
 * Merge scraped per-source JSON files into data/catalog.json.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseCatalogItemsStrict } from '../lib/catalog-parse';
import { SOURCES, type PropItem } from '../lib/types';

const DATA = path.join(process.cwd(), 'data');

/**
 * Read one source's scrape output.
 *
 * A MISSING file is normal — not every source has been scraped in a given run,
 * and nine of them have no snapshot at all. A file that exists but does not
 * validate is a scraper regression, and it fails the merge.
 *
 * The previous `catch { return [] }` could not tell those two apart, so one bad
 * record dropped an entire vendor out of `data/catalog.json` with no output
 * beyond a smaller number in the per-source line. That is the same silent-total
 * failure `loadCatalog` had, one stage earlier and harder to notice, because
 * here the evidence is destroyed rather than merely hidden.
 */
async function readSource(name: string): Promise<PropItem[]> {
  const file = path.join(DATA, `${name}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return [];
  }
  return parseCatalogItemsStrict(JSON.parse(raw), `merge:${name}`);
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
