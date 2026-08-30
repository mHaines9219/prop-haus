/**
 * Detect plate_mode for each catalog item and write it back to catalog.json.
 *
 * Algorithm (DESIGN.md §4):
 *   Sample the four 20×20 corner regions of the item's primary image.
 *   Compute mean luminance (sRGB → linear) across all sampled pixels.
 *   mean ≥ 0.88  →  'cutout'  (white/near-white background, multiply blend)
 *   mean < 0.88  →  'photo'   (lifestyle/room shot, cover blend)
 *
 * Requires sharp:  pnpm add -D sharp
 *
 * Usage:
 *   pnpm plate-mode                     # classify all items missing plateMode
 *   pnpm plate-mode --all               # reclassify every item
 *   pnpm plate-mode --source omega      # scope to one vendor
 *   pnpm plate-mode --limit 500
 *   pnpm plate-mode --concurrency 12
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';
import { parseCatalogItemsStrict } from '../lib/catalog-parse';
import { SOURCES, type Source } from '../lib/types';

// ---- sharp import ---------------------------------------------------------
// sharp is a transitive dep (next/image pulls it in). We require() at runtime
// so the script works when sharp's native binary is compiled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SharpFn = (input: Buffer) => any;
let sharpFn: SharpFn | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const mod = require('sharp') as any;
  sharpFn = (typeof mod === 'function' ? mod : mod.default ?? mod) as SharpFn;
} catch {
  console.error(
    'sharp is not available. It ships with Next.js but needs its native binary.\n' +
    'Run:  pnpm approve-builds  (select sharp), then  pnpm install  and retry.',
  );
  process.exit(1);
}

// ---- constants ------------------------------------------------------------
const DATA = path.join(process.cwd(), 'data');
const CORNER_PX = 20;           // sample a 20×20 block from each corner
const LUMINANCE_THRESHOLD = 0.88; // DESIGN.md §4

// sRGB channel value (0–255) → linear light
function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Mean luminance over an array of raw RGBA bytes
function meanLuminance(raw: Buffer): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < raw.length; i += 4) {
    const r = toLinear(raw[i]);
    const g = toLinear(raw[i + 1]);
    const b = toLinear(raw[i + 2]);
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    count++;
  }
  return count === 0 ? 1 : sum / count;
}

async function detectPlateMode(imageUrl: string): Promise<'cutout' | 'photo'> {
  if (!sharpFn) throw new Error('sharp not loaded');
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(imageUrl, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const img = sharpFn(buf);
    const meta = await img.metadata();
    const w = (meta.width as number | undefined) ?? 100;
    const h = (meta.height as number | undefined) ?? 100;
    const cw = Math.min(CORNER_PX, w);
    const ch = Math.min(CORNER_PX, h);

    // Four corners: TL, TR, BL, BR
    const corners = [
      { left: 0,      top: 0      },
      { left: w - cw, top: 0      },
      { left: 0,      top: h - ch },
      { left: w - cw, top: h - ch },
    ];

    let totalLum = 0;
    for (const c of corners) {
      const raw: Buffer = await img
        .clone()
        .extract({ left: c.left, top: c.top, width: cw, height: ch })
        .raw()
        .toBuffer();
      totalLum += meanLuminance(raw);
    }
    const mean = totalLum / corners.length;
    return mean >= LUMINANCE_THRESHOLD ? 'cutout' : 'photo';
  } finally {
    clearTimeout(timeout);
  }
}

// ---- arg parsing ----------------------------------------------------------
function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    source: get('--source') as Source | undefined,
    limit: get('--limit') ? Number(get('--limit')) : undefined,
    concurrency: get('--concurrency') ? Number(get('--concurrency')) : 8,
    all: argv.includes('--all'),
  };
}

// ---- main -----------------------------------------------------------------
async function main() {
  const args = parseArgs();
  if (args.source && !SOURCES.includes(args.source)) {
    console.error(`Unknown --source ${args.source}. Known: ${SOURCES.join(', ')}`);
    process.exit(1);
  }

  const file = path.join(DATA, 'catalog.json');
  console.log(`Reading ${file}`);
  const raw = await fs.readFile(file, 'utf8');
  const items = parseCatalogItemsStrict(JSON.parse(raw), 'plate-mode');

  const scope = args.source ? items.filter((i) => i.source === args.source) : items;
  const pending = args.all
    ? scope
    : scope.filter((i) => i.plateMode === undefined && i.images.length > 0);
  const targets = args.limit ? pending.slice(0, args.limit) : pending;

  const noImage = scope.filter((i) => i.images.length === 0).length;
  console.log(
    `Items in scope: ${scope.length} | missing plateMode: ${scope.filter((i) => i.plateMode === undefined).length} | no-image (skipped): ${noImage}`,
  );
  console.log(`Classifying ${targets.length} items (concurrency ${args.concurrency})`);

  const limiter = pLimit(args.concurrency);
  const results = new Map<string, 'cutout' | 'photo'>();
  let done = 0;
  let errs = 0;

  await Promise.all(
    targets.map((item) =>
      limiter(async () => {
        try {
          const mode = await detectPlateMode(item.images[0]);
          results.set(item.id, mode);
        } catch (err) {
          errs++;
          if (errs <= 10) console.warn(`  ${item.id}: ${(err as Error).message}`);
          // Leave plateMode undefined on error so the item is retried next run.
        } finally {
          done++;
          if (done % 100 === 0 || done === targets.length) {
            const cutouts = [...results.values()].filter((v) => v === 'cutout').length;
            const photos = results.size - cutouts;
            console.log(`  ${done}/${targets.length}  cutout:${cutouts} photo:${photos} errors:${errs}`);
          }
        }
      }),
    ),
  );

  // Merge back into the full item list
  const updated = items.map((i) => {
    const detected = results.get(i.id);
    if (detected !== undefined) return { ...i, plateMode: detected };
    // Items with no image default to 'cutout' (safe — no photo to analyze)
    if (i.images.length === 0 && i.plateMode === undefined) return { ...i, plateMode: 'cutout' as const };
    return i;
  });

  const cutouts = updated.filter((i) => i.plateMode === 'cutout').length;
  const photos = updated.filter((i) => i.plateMode === 'photo').length;
  const missing = updated.filter((i) => i.plateMode === undefined).length;
  console.log(`\nResults: cutout=${cutouts} photo=${photos} still-missing=${missing} errors=${errs}`);

  await fs.writeFile(file, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
