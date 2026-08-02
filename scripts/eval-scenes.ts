/**
 * Scene-query composition — does mood search reach the whole catalog?
 *
 *   pnpm eval:scenes
 *   pnpm eval:scenes -- --k 50
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT KNOWN-ITEM
 *
 * `eval-search.ts` measures recall with the item as its own ground truth. That
 * needs a describable item, which restricts it to the best-described tenth of
 * the catalog — so it cannot answer the question the brief actually raises.
 *
 * CLAUDE.md says users search scenes, aesthetics and moods: "70s apartment",
 * "luxury hotel lobby". Mood lives in the enrichment fields — `vibes`,
 * `settingType`, `genreFit`, `style`, `era`. An item without them has a
 * `canonicalText` of `name | category` and nothing for a mood query to match.
 *
 * This measures that directly and needs NO relevance labels. Run the brief's own
 * queries, then compare the enrichment mix of what comes back against the
 * catalog's own mix. If enriched items are 27% of the catalog but 90% of
 * results, the unenriched majority is effectively invisible to the product's
 * primary search mode — regardless of whether the returned items are any good.
 *
 * WHAT IT CANNOT TELL YOU
 *
 * Nothing about relevance. A query could return 50 perfectly-mixed items that
 * are all wrong. This measures reach, not quality — deliberately, because reach
 * is the part that needs no labels and is currently unmeasured.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../lib/catalog';
import { loadIndex, canonicalText, topK } from '../lib/embeddings';
import { percentile } from '../lib/eval/metrics';
import { isEnriched } from '../lib/eval/strata';
import type { PropItem } from '../lib/types';

const SCENES_FILE = path.join(process.cwd(), 'eval', 'scene-queries.json');
const EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';

// Deep enough that k resolvable items always exist after dropping orphans —
// the worst observed query loses 78% of its slots.
const OVERFETCH = 4000;

async function embedQuery(query: string): Promise<Float32Array> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: query }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const vec = data.data?.[0]?.embedding;
  if (!vec) throw new Error('no embedding returned');
  return new Float32Array(vec);
}

function pct(n: number, d: number): string {
  return d === 0 ? '  n/a' : ((n / d) * 100).toFixed(1).padStart(5) + '%';
}

async function main() {
  const argv = process.argv.slice(2);
  const kArg = argv.indexOf('--k');
  const k = kArg >= 0 ? Number(argv[kArg + 1]) : 50;

  const index = await loadIndex();
  if (!index) {
    console.error('No vector index — data/embeddings.f32 + .ids.json required.');
    process.exit(1);
  }
  const catalog = await loadCatalog();
  const byId = new Map(catalog.map((i) => [i.id, i]));
  const scenes = JSON.parse(await fs.readFile(SCENES_FILE, 'utf8')) as string[];

  // Catalog baseline — the mix retrieval would produce if it were blind to
  // enrichment. Everything below is measured against this.
  const enrichedTotal = catalog.filter(isEnriched).length;
  const vendorTotals = new Map<string, number>();
  for (const i of catalog) vendorTotals.set(i.source, (vendorTotals.get(i.source) ?? 0) + 1);

  console.log(`catalog=${catalog.length}  enriched=${enrichedTotal} (${pct(enrichedTotal, catalog.length).trim()})  k=${k}  scenes=${scenes.length}\n`);

  let slotsTotal = 0;
  let slotsEnriched = 0;
  let slotsRequested = 0;
  const vendorHits = new Map<string, number>();
  const deadBySource = new Map<string, number>();
  const lens: number[] = [];

  console.log('query                          enriched-in-results   dead   top vendor');
  for (const scene of scenes) {
    const vec = await embedQuery(scene);
    const hits = topK(index, vec, k);

    // A hit whose id is absent from the catalog is a DEAD SLOT: the vector
    // survives in the index but the item was dropped by validation, so the
    // shortlist silently shrinks before the reranker ever sees it.
    const items: PropItem[] = [];
    let dead = 0;
    for (const h of hits) {
      const item = byId.get(h.id);
      if (item) items.push(item);
      else {
        dead++;
        const src = h.id.split(':')[0] || 'unknown';
        deadBySource.set(src, (deadBySource.get(src) ?? 0) + 1);
      }
    }

    const enriched = items.filter(isEnriched).length;
    slotsRequested += hits.length;
    slotsTotal += items.length;
    slotsEnriched += enriched;

    const local = new Map<string, number>();
    for (const it of items) {
      vendorHits.set(it.source, (vendorHits.get(it.source) ?? 0) + 1);
      local.set(it.source, (local.get(it.source) ?? 0) + 1);
      lens.push(canonicalText(it).length);
    }
    const top = [...local.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(
      `  ${scene.padEnd(28)} ${pct(enriched, items.length)}   ${String(dead).padStart(3)}/${k}   ${top ? `${top[0]} ${pct(top[1], items.length).trim()}` : '-'}`,
    );
  }

  const baseEnriched = enrichedTotal / catalog.length;
  const obsEnriched = slotsEnriched / slotsTotal;

  console.log('\n=== dead shortlist slots ===');
  const dead = slotsRequested - slotsTotal;
  console.log(`  requested ${slotsRequested}  ·  usable ${slotsTotal}  ·  dead ${dead} (${pct(dead, slotsRequested).trim()})`);
  console.log(`  effective shortlist is ${(slotsTotal / scenes.length).toFixed(1)}, not ${k}`);
  for (const [src, n] of [...deadBySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src.padEnd(20)} ${String(n).padStart(4)}`);
  }

  console.log('\n=== reach ===');
  console.log(`  enriched share of catalog   ${pct(enrichedTotal, catalog.length)}`);
  console.log(`  enriched share of results   ${pct(slotsEnriched, slotsTotal)}`);
  console.log(`  over-representation         ${(obsEnriched / baseEnriched).toFixed(2)}x`);
  console.log(`  unenriched items in ${slotsTotal} slots  ${slotsTotal - slotsEnriched}`);

  console.log('\n=== vendor mix (catalog share -> result share) ===');
  const rows = [...vendorTotals.entries()].sort((a, b) => b[1] - a[1]);
  for (const [vendor, total] of rows) {
    const hits = vendorHits.get(vendor) ?? 0;
    const catShare = total / catalog.length;
    const resShare = hits / slotsTotal;
    const lift = catShare > 0 ? resShare / catShare : 0;
    console.log(
      `  ${vendor.padEnd(20)} ${pct(total, catalog.length)} -> ${pct(hits, slotsTotal)}   ${lift.toFixed(2)}x`,
    );
  }

  console.log('\n=== canonicalText length of retrieved items ===');
  console.log(`  p50 ${percentile(lens, 50)}  p90 ${percentile(lens, 90)} chars`);

  // What the same queries return once the index no longer holds vectors the
  // catalog can't resolve. Ranking over resolvable vectors and taking k is
  // exactly what a filtered index produces, so this predicts the fix before it
  // lands and re-runs as the after-measurement once it has.
  console.log('\n=== projected: index filtered to catalog ===');
  let fSlots = 0;
  let fEnriched = 0;
  const fVendor = new Map<string, number>();
  for (const scene of scenes) {
    const vec = await embedQuery(scene);
    const items = topK(index, vec, OVERFETCH)
      .map((h) => byId.get(h.id))
      .filter((x): x is PropItem => Boolean(x))
      .slice(0, k);
    fSlots += items.length;
    fEnriched += items.filter(isEnriched).length;
    for (const it of items) fVendor.set(it.source, (fVendor.get(it.source) ?? 0) + 1);
  }
  console.log(`  usable slots     ${slotsTotal}/${slotsRequested} -> ${fSlots}/${slotsRequested}   (+${fSlots - slotsTotal})`);
  console.log(`  enriched share   ${pct(slotsEnriched, slotsTotal)} -> ${pct(fEnriched, fSlots)}`);
  console.log('  recovered slots by vendor:');
  for (const [vendor] of [...fVendor.entries()].sort((a, b) => b[1] - a[1])) {
    const before = vendorHits.get(vendor) ?? 0;
    const after = fVendor.get(vendor) ?? 0;
    if (after - before === 0) continue;
    console.log(`    ${vendor.padEnd(20)} ${String(before).padStart(4)} -> ${String(after).padStart(4)}   +${after - before}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
