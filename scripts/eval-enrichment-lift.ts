/**
 * Does enrichment actually improve mood-query reach? A controlled sample test.
 *
 *   pnpm eval:enrichment            # 60 items
 *   pnpm eval:enrichment -- --n 120 --source omega
 *
 * WHY THIS EXISTS
 *
 * `eval-scenes.ts` showed enriched items are only 1.60x over-represented in
 * mood results — far weaker than expected, and not the evidence anyone assumed.
 * The clean test is to run `pnpm enrich` and re-measure, but that is blocked on
 * the stale catalog snapshot (four unguarded `Catalog.parse` call sites).
 *
 * This gets the answer without the pipeline. Take items with NO enrichment,
 * enrich them with the same model, prompt and vision call `scripts/enrich.ts`
 * uses, then measure where they rank for the brief's scene queries before and
 * after. One variable moves.
 *
 * METHOD NOTE
 *
 * Both sides are freshly embedded rather than read from the index. The stored
 * index has measurable drift against current `canonicalText` (p50 identical but
 * a tail down to 0.71 cosine), so reading "before" from disk would confound
 * enrichment lift with staleness. Same embedding call for both sides.
 *
 * Ranks are exact, not sampled: for each query the full index is scored once,
 * sorted, and each item's before/after score is binary-searched into it.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';
import { loadCatalog } from '../lib/catalog';
import { loadIndex, canonicalText, cosine, EMBED_DIM } from '../lib/embeddings';
import { percentile } from '../lib/eval/metrics';
import { isEnriched } from '../lib/eval/strata';
import { ENUM_LIST } from '../lib/enrichment-enums';
import type { PropItem } from '../lib/types';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';
const ENRICH_MODEL = process.env.OPENROUTER_ENRICH_MODEL || 'anthropic/claude-haiku-4.5';
const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';
const SCENES_FILE = path.join(process.cwd(), 'eval', 'scene-queries.json');

type Enrichment = {
  style?: string[];
  era?: string;
  materials?: string[];
  colors?: string[];
  vibes?: string[];
  settingType?: string[];
  genreFit?: string[];
  tags?: string[];
};

/** Mirrors buildSystemPrompt() in scripts/enrich.ts so the test is faithful. */
function systemPrompt(): string {
  return `You tag rental props for a Los Angeles AI-search catalog. Given an item's name, description, source category path, and primary image, output a JSON object filling these fields with values strictly chosen from the provided enums (omit fields if unsure — do not invent values):

- style: array of style slugs (pick 0-3)
- era: single era slug
- materials: array (pick 1-4 likely materials visible)
- colors: array (pick 1-4 dominant colors)
- vibes: array (pick 0-4 mood/feel tags)
- settingType: array (pick 0-3 plausible scene settings)
- genreFit: array (pick 0-3 genres this item suits)
- tags: array of free-form keywords (max 8, lowercase, hyphenated) capturing distinguishing features (e.g., "brass-finish", "tufted-back", "claw-foot", "single-bulb")

ALLOWED VALUES:
${Object.entries(ENUM_LIST)
  .map(([k, v]) => `${k}: ${(v as readonly string[]).join(', ')}`)
  .join('\n')}

Respond with ONLY a JSON object. No prose, no markdown.`;
}

function pickEnum(values: unknown, allowed: readonly string[]): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values.filter((v): v is string => typeof v === 'string' && allowed.includes(v));
  return out.length ? out : undefined;
}

function sanitize(raw: unknown): Enrichment {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Enrichment = {};
  out.style = pickEnum(r.style, ENUM_LIST.style);
  if (typeof r.era === 'string' && (ENUM_LIST.era as readonly string[]).includes(r.era)) out.era = r.era;
  out.materials = pickEnum(r.materials, ENUM_LIST.materials);
  out.colors = pickEnum(r.colors, ENUM_LIST.colors);
  out.vibes = pickEnum(r.vibes, ENUM_LIST.vibes);
  out.settingType = pickEnum(r.settingType, ENUM_LIST.settingType);
  out.genreFit = pickEnum(r.genreFit, ENUM_LIST.genreFit);
  if (Array.isArray(r.tags)) {
    const tags = r.tags.filter((t): t is string => typeof t === 'string').slice(0, 8);
    if (tags.length) out.tags = tags;
  }
  return out;
}

async function enrichOne(item: PropItem, system: string, apiKey: string): Promise<Enrichment> {
  const text = [
    `NAME: ${item.name}`,
    item.description ? `DESCRIPTION: ${item.description}` : '',
    `VENDOR CATEGORY PATH: ${item.sourceCategoryPath.join(' / ')}`,
    `UNIFIED CATEGORY: ${item.category}`,
  ]
    .filter(Boolean)
    .join('\n');
  const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
  if (item.images[0]) content.push({ type: 'image_url', image_url: { url: item.images[0] } });

  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      max_tokens: 600,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
        { role: 'user', content },
      ],
    }),
  });
  if (!res.ok) throw new Error(`enrich ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  try {
    const cleaned = (data.choices?.[0]?.message?.content ?? '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '');
    return sanitize(JSON.parse(cleaned));
  } catch {
    return {};
  }
}

async function embedBatch(texts: string[], apiKey: string): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const chunk = texts.slice(i, i + 64);
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: chunk }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    for (const e of data.data.sort((a, b) => a.index - b.index)) out.push(new Float32Array(e.embedding));
  }
  return out;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 0x100000000;
}

/** Rank of `score` in a descending-sorted array — how many entries beat it, +1. */
function rankIn(sortedDesc: Float64Array, score: number): number {
  let lo = 0;
  let hi = sortedDesc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDesc[mid] > score) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const num = (flag: string, def: number) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : def;
  };
  const n = num('--n', 60);
  const seed = num('--seed', 4242);
  const srcIdx = argv.indexOf('--source');
  const source = srcIdx >= 0 ? argv[srcIdx + 1] : 'omega';

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const index = await loadIndex();
  if (!index) throw new Error('no vector index');
  const catalog = await loadCatalog();
  const scenes = JSON.parse(await fs.readFile(SCENES_FILE, 'utf8')) as string[];

  // Only unenriched items with an image — enrichment is a vision call, so an
  // item with no image is testing a different thing.
  const pool = catalog.filter((i) => i.source === source && !isEnriched(i) && i.images[0]);
  console.log(`source=${source}  unenriched with image=${pool.length}  sampling n=${n}  seed=${seed}`);
  if (pool.length === 0) throw new Error(`no unenriched items with images for source "${source}"`);

  const r = rng(seed);
  const picked = new Map<string, PropItem>();
  let guard = 0;
  while (picked.size < Math.min(n, pool.length) && guard++ < n * 50) {
    const it = pool[Math.floor(r() * pool.length)];
    picked.set(it.id, it);
  }
  const items = [...picked.values()];

  const system = systemPrompt();
  const limit = pLimit(6);
  let done = 0;
  const enrichments = await Promise.all(
    items.map((it) =>
      limit(async () => {
        const e = await enrichOne(it, system, apiKey).catch(() => ({}) as Enrichment);
        if (++done % 20 === 0) console.log(`  enriched ${done}/${items.length}`);
        return e;
      }),
    ),
  );

  const filled = enrichments.filter((e) => Object.keys(e).length > 0).length;
  console.log(`enrichment returned fields for ${filled}/${items.length} items\n`);

  const beforeText = items.map((it) => canonicalText(it));
  const afterText = items.map((it, i) => canonicalText({ ...it, ...enrichments[i] } as PropItem));

  console.log('embedding before/after…');
  const beforeVecs = await embedBatch(beforeText, apiKey);
  const afterVecs = await embedBatch(afterText, apiKey);

  const lenBefore = beforeText.map((t) => t.length);
  const lenAfter = afterText.map((t) => t.length);
  console.log(`canonicalText chars  p50 ${percentile(lenBefore, 50)} -> ${percentile(lenAfter, 50)}\n`);

  const ranksBefore: number[] = [];
  const ranksAfter: number[] = [];
  let intoTop50 = 0;
  let intoTop200 = 0;
  let intoTop1000 = 0;
  let improved = 0;

  console.log('query                          median rank before -> after');
  for (const scene of scenes) {
    const [qv] = await embedBatch([scene], apiKey);

    // Score the whole index once, sort descending; ranks come from binary search.
    const scores = new Float64Array(index.ids.length);
    for (let i = 0; i < index.ids.length; i++) {
      scores[i] = cosine(index.vectors, qv, i * EMBED_DIM, 0, EMBED_DIM);
    }
    scores.sort();
    scores.reverse();

    const qb: number[] = [];
    const qa: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const sb = cosine(beforeVecs[i], qv, 0, 0, EMBED_DIM);
      const sa = cosine(afterVecs[i], qv, 0, 0, EMBED_DIM);
      const rb = rankIn(scores, sb);
      const ra = rankIn(scores, sa);
      qb.push(rb);
      qa.push(ra);
      ranksBefore.push(rb);
      ranksAfter.push(ra);
      if (ra < rb) improved++;
      if (rb > 50 && ra <= 50) intoTop50++;
      if (rb > 200 && ra <= 200) intoTop200++;
      if (rb > 1000 && ra <= 1000) intoTop1000++;
    }
    console.log(
      `  ${scene.padEnd(28)} ${String(percentile(qb, 50)).padStart(7)} -> ${String(percentile(qa, 50)).padStart(7)}`,
    );
  }

  const pairs = ranksBefore.length;
  console.log(`\n=== rank across ${pairs} item-query pairs (index of ${index.ids.length}) ===`);
  console.log(`  median   ${percentile(ranksBefore, 50)} -> ${percentile(ranksAfter, 50)}`);
  console.log(`  p10      ${percentile(ranksBefore, 10)} -> ${percentile(ranksAfter, 10)}`);
  console.log(`  improved ${improved}/${pairs} (${((improved / pairs) * 100).toFixed(1)}%)`);
  console.log('\n=== crossings into shortlist range ===');
  console.log(`  into top 50    ${intoTop50}`);
  console.log(`  into top 200   ${intoTop200}`);
  console.log(`  into top 1000  ${intoTop1000}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
