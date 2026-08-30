/**
 * Enrich scraped items with AI-search metadata (style/era/materials/colors/vibes/settingType/genreFit/tags).
 * Uses Claude Haiku 4.5 via OpenRouter with vision and prompt caching.
 *
 * Usage:
 *   pnpm enrich                        # enrich data/catalog.json in place
 *   pnpm enrich --source omega
 *   pnpm enrich --limit 1000
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pLimit from 'p-limit';
import { parseCatalogItemsStrict } from '../lib/catalog-parse';
import { SOURCES, type PropItem, type Source } from '../lib/types';
import { ENUM_LIST } from '../lib/enrichment-enums';

const MODEL = process.env.OPENROUTER_ENRICH_MODEL || 'anthropic/claude-haiku-4.5';
const CACHE_DIR = path.join(process.cwd(), '.enrich-cache');
const DATA = path.join(process.cwd(), 'data');
const CONCURRENCY = 6;
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

function buildSystemPrompt(): string {
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

function cacheKey(item: PropItem): string {
  const fingerprint = JSON.stringify({
    n: item.name,
    d: item.description,
    p: item.sourceCategoryPath,
    img: item.images[0],
    m: MODEL,
  });
  return crypto.createHash('sha1').update(fingerprint).digest('hex');
}

async function readCache(key: string): Promise<Enrichment | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, key + '.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: Enrichment) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, key + '.json'), JSON.stringify(value), 'utf8');
}

function filterEnum(values: unknown, allowed: readonly string[]): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values.filter((v): v is string => typeof v === 'string' && allowed.includes(v));
  return out.length ? out : undefined;
}

function filterTags(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .filter((s) => s.length > 1 && s.length < 32)
    .slice(0, 8);
  return out.length ? out : undefined;
}

function sanitize(raw: unknown): Enrichment {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Enrichment = {};
  const style = filterEnum(r.style, ENUM_LIST.style);
  if (style) out.style = style;
  const era = typeof r.era === 'string' && (ENUM_LIST.era as readonly string[]).includes(r.era) ? r.era : undefined;
  if (era) out.era = era;
  const materials = filterEnum(r.materials, ENUM_LIST.materials);
  if (materials) out.materials = materials;
  const colors = filterEnum(r.colors, ENUM_LIST.colors);
  if (colors) out.colors = colors;
  const vibes = filterEnum(r.vibes, ENUM_LIST.vibes);
  if (vibes) out.vibes = vibes;
  const settingType = filterEnum(r.settingType, ENUM_LIST.settingType);
  if (settingType) out.settingType = settingType;
  const genreFit = filterEnum(r.genreFit, ENUM_LIST.genreFit);
  if (genreFit) out.genreFit = genreFit;
  const tags = filterTags(r.tags);
  if (tags) out.tags = tags;
  return out;
}

function userContent(item: PropItem) {
  const text = [
    `NAME: ${item.name}`,
    item.description ? `DESCRIPTION: ${item.description}` : '',
    `VENDOR CATEGORY PATH: ${item.sourceCategoryPath.join(' / ')}`,
    `UNIFIED CATEGORY: ${item.category}`,
  ]
    .filter(Boolean)
    .join('\n');
  const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
  const img = item.images[0];
  if (img) content.push({ type: 'image_url', image_url: { url: img } });
  return content;
}

// Text-only content for items with no image — vision models still understand
// prop names and category paths well enough to assign style/era/materials/vibes.
function userContentTextOnly(item: PropItem) {
  const text = [
    `NAME: ${item.name}`,
    item.description ? `DESCRIPTION: ${item.description}` : '',
    `VENDOR CATEGORY PATH: ${item.sourceCategoryPath.join(' / ')}`,
    `UNIFIED CATEGORY: ${item.category}`,
    '(No image available — infer from name, description, and category.)',
  ]
    .filter(Boolean)
    .join('\n');
  return [{ type: 'text', text }];
}

async function enrichOne(item: PropItem, system: string, apiKey: string): Promise<Enrichment> {
  const key = cacheKey(item);
  const hit = await readCache(key);
  if (hit) return hit;

  // Items without images use text-only content — the vision model still tags
  // well from name, description, and category path.
  const content = item.images[0] ? userContent(item) : userContentTextOnly(item);

  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
      'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        // Prompt caching: OpenRouter passes Anthropic cache_control through when using anthropic/* models.
        {
          role: 'system',
          content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        },
        { role: 'user', content },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';

  let parsed: unknown;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }
  const enrichment = sanitize(parsed);
  await writeCache(key, enrichment);
  return enrichment;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    source: get('--source') as Source | undefined,
    limit: get('--limit') ? Number(get('--limit')) : undefined,
    file: get('--file'),
    all: argv.includes('--all'),
  };
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    process.exit(1);
  }
  const args = parseArgs();
  if (args.source && !SOURCES.includes(args.source)) {
    console.error(`Unknown --source ${args.source}. Known sources: ${SOURCES.join(', ')}`);
    process.exit(1);
  }

  // `--source X` originally only read data/X.json, the per-source scrape output.
  // Those files exist right after a scrape and are gone once merged, so on a
  // merged checkout the flag failed with ENOENT. Fall back to filtering the
  // catalog, which is the same set of items by a different route.
  const sourceFile = args.source ? path.join(DATA, `${args.source}.json`) : undefined;
  const hasSourceFile = sourceFile ? await fileExists(sourceFile) : false;
  const file = args.file
    ? path.resolve(args.file)
    : hasSourceFile && sourceFile
      ? sourceFile
      : path.join(DATA, 'catalog.json');
  console.log(`Reading ${file}`);
  const raw = await fs.readFile(file, 'utf8');
  const items = parseCatalogItemsStrict(JSON.parse(raw), 'enrich');

  // Scope to one source when asked and the file we loaded holds more than that
  // source. Without this, `--source omega --limit 500` silently enriches the
  // first 500 unenriched items in catalog order — which is a different vendor.
  const scope =
    args.source && !hasSourceFile ? items.filter((i) => i.source === args.source) : items;
  if (args.source) console.log(`Scoped to source ${args.source}: ${scope.length} items`);

  // Incremental resume: skip items already enriched (have any AI-tag field).
  // Pass --all to force re-enrichment of everything.
  const isEnriched = (i: PropItem) =>
    !!(i.style?.length || i.vibes?.length || i.tags?.length || i.materials?.length ||
       i.colors?.length || i.settingType?.length || i.genreFit?.length || i.era);
  const pending = args.all ? scope : scope.filter((i) => !isEnriched(i));
  const targets = args.limit ? pending.slice(0, args.limit) : pending;
  console.log(`Enriching ${targets.length} of ${items.length} items with ${MODEL} (concurrency ${CONCURRENCY})`);

  const withImage = targets.filter((i) => i.images.length > 0).length;
  const textOnly = targets.length - withImage;
  console.log(`  vision: ${withImage}  text-only: ${textOnly}`);

  const system = buildSystemPrompt();
  const limit = pLimit(CONCURRENCY);
  let done = 0;
  let errs = 0;
  const failedIds: string[] = [];

  const enriched = await Promise.all(
    targets.map((item) =>
      limit(async () => {
        try {
          const e = await enrichOne(item, system, apiKey);
          return { ...item, ...e };
        } catch (err) {
          errs++;
          failedIds.push(item.id);
          if (errs <= 5) console.warn(`  ${item.id}: ${(err as Error).message}`);
          return item;
        } finally {
          done++;
          if (done % 25 === 0) console.log(`  ${done}/${targets.length} (${errs} errors)`);
        }
      }),
    ),
  );

  const byId = new Map(enriched.map((i) => [i.id, i]));
  const updated = items.map((i) => byId.get(i.id) ?? i);

  // Coverage report
  const totalEnriched = updated.filter(isEnriched).length;
  const coveragePct = ((totalEnriched / updated.length) * 100).toFixed(1);
  console.log(`\nCoverage: ${totalEnriched}/${updated.length} enriched (${coveragePct}%)`);

  // Log failed IDs so they can be retried or investigated
  if (failedIds.length > 0) {
    const errFile = path.join(DATA, 'enrich-errors.json');
    await fs.writeFile(errFile, JSON.stringify(failedIds, null, 2), 'utf8');
    console.warn(`${failedIds.length} items failed — IDs written to ${errFile}`);
    console.warn('Re-run enrich to retry them (they have no cached result).');
  }

  await fs.writeFile(file, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`Wrote ${file} (${updated.length} items, ${errs} errors)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
