/**
 * Scored search eval — known-item retrieval against the live catalog.
 *
 *   pnpm eval:search                     # cached queries, 40 items
 *   pnpm eval:search -- --n 100          # larger sample (regenerates cache misses)
 *   pnpm eval:search -- --k 500          # probe a deeper shortlist ceiling
 *   pnpm eval:search -- --regenerate     # rebuild every paraphrase
 *
 * WHAT THIS MEASURES
 *
 * Known-item retrieval: take a real catalog item, ask an LLM to write the query
 * a set decorator would plausibly type when looking for that kind of thing, then
 * check where the original item lands in the shortlist. The item is its own
 * ground truth, so this needs no hand-labeling and can run over any sample size.
 *
 * The number it exists to produce is the SHORTLIST RECALL CEILING.
 * `runTextMode` (lib/search-modes.ts) shortlists 50 of ~96k items by embedding
 * and reranks only those. Every item outside that 50 is unreachable no matter
 * how good the reranker gets. Hit-rate@50 is therefore a hard upper bound on
 * end-to-end search quality, and no rerank-prompt tuning can move it.
 *
 * WHAT IT DOES NOT MEASURE
 *
 * Rerank precision. Ordering quality needs graded judgments over a fixed query
 * set; that is a separate mode and is not implemented here yet.
 *
 * KNOWN BIAS — read before quoting the number
 *
 * Paraphrases are generated from the item's own enriched fields, and those same
 * fields are what `canonicalText` (lib/embeddings.ts:12) embedded. The query and
 * the document therefore derive from a shared source, which flatters recall
 * relative to what a real user types. Treat the result as an OPTIMISTIC BOUND:
 * if hit-rate@50 is bad here, it is worse in production. The prompt suppresses
 * the item's name and vendor to limit the leak, but cannot remove it.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../lib/catalog';
import { loadIndex, topK } from '../lib/embeddings';
import { hitRateAtK, mrr, percentile, rankOf } from '../lib/eval/metrics';
import type { PropItem } from '../lib/types';

const CACHE_FILE = path.join(process.cwd(), 'eval', 'known-item-queries.json');
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const QUERY_GEN_MODEL = process.env.EVAL_QUERY_MODEL || 'anthropic/claude-haiku-4.5';
const EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';

const REPORTED_KS = [10, 25, 50, 100, 200];

type Args = { n: number; k: number; regenerate: boolean; seed: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { n: 40, k: 200, regenerate: false, seed: 1337 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') args.n = Number(argv[++i]);
    else if (argv[i] === '--k') args.k = Number(argv[++i]);
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--regenerate') args.regenerate = true;
  }
  return args;
}

/**
 * Seeded LCG (Numerical Recipes constants). Sampling must be reproducible or
 * two runs are not comparable and the whole harness is decorative.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Sample items that are actually describable. An item with no description and
 * no enrichment cannot produce a fair query — the eval would be measuring the
 * enrichment pass's coverage, not retrieval.
 */
function sampleItems(catalog: PropItem[], n: number, seed: number): PropItem[] {
  const eligible = catalog.filter(
    (i) => (i.description?.length ?? 0) > 40 && (i.style?.length || i.era || i.materials?.length),
  );
  const rng = makeRng(seed);
  const picked = new Map<string, PropItem>();
  let guard = 0;
  while (picked.size < Math.min(n, eligible.length) && guard++ < n * 50) {
    const it = eligible[Math.floor(rng() * eligible.length)];
    picked.set(it.id, it);
  }
  return [...picked.values()];
}

const QUERY_GEN_SYSTEM = `You write realistic search queries for a production-prop rental catalog.

Given one catalog item, write the query a set decorator or production designer would type when they need that kind of thing for a shoot.

Rules:
- 4 to 12 words. Natural phrasing, lowercase, no punctuation at the end.
- Describe the KIND of object plus the look — era, style, material, or mood.
- NEVER use the item's exact product name, its SKU, or the vendor's name.
- Write what someone searching WITHOUT having seen this listing would type.
- Do not describe a specific unit ("this chair"); describe the type.

Respond with ONLY the query text. No quotes, no preamble.`;

async function callOpenRouter(body: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
      'x-title': 'prop-haus-eval',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function generateQuery(item: PropItem): Promise<string> {
  const facets = [
    `category: ${item.category}${item.subcategory ? '/' + item.subcategory : ''}`,
    item.style?.length ? `style: ${item.style.join(', ')}` : '',
    item.era ? `era: ${item.era}` : '',
    item.materials?.length ? `materials: ${item.materials.join(', ')}` : '',
    item.colors?.length ? `colors: ${item.colors.join(', ')}` : '',
    item.description ? `description: ${item.description.slice(0, 300)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return callOpenRouter({
    model: QUERY_GEN_MODEL,
    temperature: 0.7,
    max_tokens: 60,
    messages: [
      { role: 'system', content: QUERY_GEN_SYSTEM },
      { role: 'user', content: facets },
    ],
  });
}

/** Embed directly so the runner can time the embed call apart from the scan. */
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

async function readCache(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeCache(cache: Record<string, string>) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + '%';
}

async function main() {
  const args = parseArgs();

  const index = await loadIndex();
  if (!index) {
    console.error(
      'No vector index. data/embeddings.f32 + data/embeddings.ids.json are required (pnpm embed).',
    );
    process.exit(1);
  }
  const catalog = await loadCatalog();
  console.log(`catalog=${catalog.length} vectors=${index.ids.length} k=${args.k} n=${args.n} seed=${args.seed}`);

  const items = sampleItems(catalog, args.n, args.seed);
  if (items.length < args.n) {
    console.log(`note: only ${items.length} items met the describability bar (wanted ${args.n})`);
  }

  const cache = args.regenerate ? {} : await readCache();
  let generated = 0;
  for (const item of items) {
    if (!cache[item.id]) {
      cache[item.id] = await generateQuery(item);
      generated++;
    }
  }
  if (generated > 0) {
    await writeCache(cache);
    console.log(`generated ${generated} new queries (cached to eval/known-item-queries.json)`);
  }

  const ranks: Array<number | null> = [];
  const embedMs: number[] = [];
  const scanMs: number[] = [];
  const misses: Array<{ id: string; query: string; name: string }> = [];

  for (const item of items) {
    const query = cache[item.id];
    if (!query) continue;

    const t0 = Date.now();
    const vec = await embedQuery(query);
    const t1 = Date.now();
    const hits = topK(index, vec, args.k);
    const t2 = Date.now();

    embedMs.push(t1 - t0);
    scanMs.push(t2 - t1);

    const rank = rankOf(
      hits.map((h) => h.id),
      item.id,
    );
    ranks.push(rank);
    if (rank === null) misses.push({ id: item.id, query, name: item.name.slice(0, 70) });
  }

  console.log(`\n=== known-item retrieval (n=${ranks.length}) ===`);
  console.log('  metric        value    reading');
  for (const k of REPORTED_KS.filter((k) => k <= args.k)) {
    const note =
      k === 50 ? '  <- the shortlist runTextMode actually uses' : k === 200 ? '  <- ceiling if we widened it' : '';
    console.log(`  hit-rate@${String(k).padEnd(4)} ${pct(hitRateAtK(ranks, k))}${note}`);
  }
  console.log(`  MRR          ${mrr(ranks).toFixed(4)}`);
  console.log(`  missed@${args.k}    ${misses.length}/${ranks.length}`);

  console.log('\n=== latency ===');
  console.log(`  embed  p50 ${percentile(embedMs, 50)}ms  p95 ${percentile(embedMs, 95)}ms`);
  console.log(`  scan   p50 ${percentile(scanMs, 50)}ms  p95 ${percentile(scanMs, 95)}ms   (linear over ${index.ids.length} vectors)`);

  if (misses.length > 0) {
    console.log(`\n=== misses (not in top ${args.k}) ===`);
    for (const m of misses.slice(0, 15)) {
      console.log(`  "${m.query}"\n    wanted: ${m.name}`);
    }
    if (misses.length > 15) console.log(`  ... and ${misses.length - 15} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
