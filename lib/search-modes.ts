import { shortlistByEmbedding, shortlistAsText, type Shortlist } from './search-index';
import { interpretMoodboard } from './moodboard';
import { loadCatalog } from './catalog';
import { keywordSearch } from './keyword-search';
import type {
  Attachment,
  DetectedItem,
  MoodboardInterpretation,
  PropItem,
  SearchMatch,
  SearchMode,
  SearchResponse,
} from './types';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RERANK_MODEL_DEFAULT = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const SONNET = 'anthropic/claude-sonnet-4.6';

// --- helpers -------------------------------------------------------------

function syntheticQuery(item: DetectedItem | { label: string; reason: string }): string {
  if ('description' in item) {
    const meta = [
      item.style?.join(','),
      item.era,
      item.materials?.join(','),
      item.colors?.join(','),
    ]
      .filter(Boolean)
      .join(' ');
    return `${item.label}. ${item.description}. ${meta}`.trim();
  }
  return `${item.label}. ${item.reason}`.trim();
}

type RerankResult = { ids: string[]; explanation: string };

function safeParseJson<T = unknown>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* */
      }
    }
    return null;
  }
}

async function callOpenRouter(body: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
      'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

// --- text-only rerank (existing behavior) -------------------------------

const TEXT_RERANK_SYSTEM = `You are a search assistant for a Los Angeles production-prop rental aggregator.
You'll see a user's natural-language request and a shortlist of candidates (already pre-filtered by semantic similarity). Each candidate is one line:
  ID | category/subcategory | name [style | era | materials | colors] — description

Pick the items that best match the user's intent. Use style, era, materials, and colors to disambiguate. Be discerning.

Respond with ONLY a JSON object: { "ids": ["id1", ...], "explanation": "short sentence" }
- Up to 24 ids, best matches first.
- IDs MUST come verbatim from the shortlist. Never invent.`;

async function rerankShortlist(query: string, shortlist: Shortlist, max = 24, model = RERANK_MODEL_DEFAULT): Promise<RerankResult> {
  if (shortlist.length === 0) return { ids: [], explanation: '' };
  const allowed = new Set(shortlist.map((s) => s.item.id));
  const content = await callOpenRouter({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: TEXT_RERANK_SYSTEM },
      {
        role: 'user',
        content: `USER REQUEST:\n${query}\n\nSHORTLIST (${shortlist.length} candidates):\n${shortlistAsText(shortlist)}`,
      },
    ],
  });
  const parsed = safeParseJson<{ ids?: unknown; explanation?: unknown }>(content) ?? {};
  const ids = Array.isArray(parsed.ids)
    ? (parsed.ids.filter((x) => typeof x === 'string' && allowed.has(x as string)) as string[]).slice(0, max)
    : [];
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';
  return { ids, explanation };
}

// --- merging -------------------------------------------------------------

type Bucket = { query: string; tag: string; topN: number };

function buildBuckets(interp: MoodboardInterpretation, userQuery: string | undefined): Bucket[] {
  const buckets: Bucket[] = [];
  for (const d of interp.detectedItems) {
    buckets.push({ query: syntheticQuery(d), tag: d.label, topN: 8 });
  }
  for (const a of interp.suggestedAdditions) {
    buckets.push({ query: syntheticQuery(a), tag: `tasteful addition: ${a.label}`, topN: 4 });
  }
  if (userQuery?.trim()) {
    buckets.push({ query: userQuery.trim(), tag: 'brief', topN: 8 });
  }
  return buckets;
}

type MatchAccumulator = Map<string, { item: PropItem; matchedVia: Set<string>; score: number }>;

function addMatch(acc: MatchAccumulator, item: PropItem, tag: string, score: number) {
  const cur = acc.get(item.id);
  if (cur) {
    cur.matchedVia.add(tag);
    cur.score = Math.max(cur.score, score);
  } else {
    acc.set(item.id, { item, matchedVia: new Set([tag]), score });
  }
}

function flattenMatches(acc: MatchAccumulator, limit = 60): SearchMatch[] {
  return [...acc.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => ({ item: m.item, matchedVia: [...m.matchedVia], score: m.score }));
}

// --- mode: text ----------------------------------------------------------

async function runTextMode(query: string): Promise<SearchResponse> {
  let shortlist = await shortlistByEmbedding(query, 50);
  let { ids, explanation } = await rerankShortlist(query, shortlist);

  // Recall expansion: reranker got nothing despite a populated shortlist — widen
  // the embedding window to 150 and retry once. This catches queries where the
  // right item sits just outside the top-50 cosine neighbours (Bumble measured
  // ~15% of known-item queries falling into this gap).
  if (ids.length === 0 && shortlist.length > 0) {
    shortlist = await shortlistByEmbedding(query, 150);
    ({ ids, explanation } = await rerankShortlist(query, shortlist, 24));
  }

  const byId = new Map(shortlist.map((s) => [s.item.id, s]));
  const matches: SearchMatch[] = ids
    .map((id, i) => {
      const s = byId.get(id);
      if (!s) return null;
      return { item: s.item, matchedVia: ['query'], score: 1 - i / ids.length };
    })
    .filter((x): x is SearchMatch => x !== null);

  // Keyword fallback: if the full embedding path produced nothing (no shortlist
  // or reranker stripped everything), fall back to exact keyword matching. This
  // rescues literal item-name queries ("Eames chair", "Tiffany lamp") where the
  // embedding similarity is diffuse and the reranker has nothing to work with.
  if (matches.length === 0) {
    const catalog = await loadCatalog();
    const kwMatches = keywordSearch(catalog, query, { limit: 24 });
    if (kwMatches.length > 0) {
      return {
        query,
        mode: 'text',
        modelsUsed: [RERANK_MODEL_DEFAULT],
        matches: kwMatches,
        explanation: `Showing keyword matches for "${query}" — no semantic matches found.`,
      };
    }
  }

  return { query, mode: 'text', modelsUsed: [RERANK_MODEL_DEFAULT], matches, explanation };
}

// --- mode: haiku / sonnet (single vision pass + per-bucket rerank) -----

async function runVisionMode(
  attachments: Attachment[],
  query: string | undefined,
  mode: 'haiku' | 'sonnet',
): Promise<SearchResponse> {
  const { interpretation, modelUsed } = await interpretMoodboard(attachments, query, mode);
  const buckets = buildBuckets(interpretation, query);
  const acc: MatchAccumulator = new Map();

  // Run shortlists in parallel; rerank serially to keep request count modest.
  const shortlists = await Promise.all(buckets.map((b) => shortlistByEmbedding(b.query, 30)));

  await Promise.all(
    buckets.map(async (b, i) => {
      const sl = shortlists[i];
      const { ids } = await rerankShortlist(b.query, sl, b.topN);
      const byId = new Map(sl.map((s) => [s.item.id, s]));
      ids.forEach((id, rank) => {
        const s = byId.get(id);
        if (s) addMatch(acc, s.item, b.tag, (1 - rank / Math.max(1, ids.length)) * (b.tag === 'brief' ? 1.0 : 0.9));
      });
    }),
  );

  return {
    query,
    mode,
    modelsUsed: [modelUsed, RERANK_MODEL_DEFAULT],
    interpretation,
    matches: flattenMatches(acc),
    explanation: interpretation.overall.summary,
  };
}

// --- mode: haiku-then-sonnet --------------------------------------------

const SONNET_RERANK_SYSTEM = `You are a production designer's eye matching catalog rentals to a moodboard.
You see the user's moodboard images, optional brief, the detected items with descriptions, and a candidate pool of catalog items (each as: ID | name [style | era | materials | colors] — description).

For each detected item AND for each suggested addition, pick up to 6 IDs from the candidate pool that best match — visually if you can infer it from name/style/era/materials/colors, otherwise stylistically.

Respond with ONLY JSON: { "groups": [ { "label": string, "ids": string[] } ], "explanation": string }
- IDs MUST be verbatim from the candidate pool.
- Be discerning. If no candidate fits, return an empty array for that group.`;

async function runHaikuThenSonnet(
  attachments: Attachment[],
  query: string | undefined,
): Promise<SearchResponse> {
  const { interpretation, modelUsed } = await interpretMoodboard(attachments, query, 'haiku-then-sonnet');
  const buckets = buildBuckets(interpretation, query);
  if (buckets.length === 0) {
    return {
      query,
      mode: 'haiku-then-sonnet',
      modelsUsed: [modelUsed, SONNET],
      interpretation,
      matches: [],
      explanation: interpretation.overall.summary,
    };
  }
  // Shortlist 30 per bucket in parallel.
  const shortlists = await Promise.all(buckets.map((b) => shortlistByEmbedding(b.query, 30)));

  // Build a unified candidate pool with bucket-scoped IDs allowed.
  const poolMap = new Map<string, { item: PropItem; bucketTags: Set<string> }>();
  shortlists.forEach((sl, i) => {
    const tag = buckets[i].tag;
    for (const { item } of sl) {
      const cur = poolMap.get(item.id);
      if (cur) cur.bucketTags.add(tag);
      else poolMap.set(item.id, { item, bucketTags: new Set([tag]) });
    }
  });
  const poolText = [...poolMap.values()]
    .map(({ item }) => {
      const tags = [item.style?.join(','), item.era, item.materials?.join(','), item.colors?.join(',')]
        .filter(Boolean)
        .join(' | ');
      const desc = item.description ? ' — ' + item.description.slice(0, 140) : '';
      return `${item.id} | ${item.name}${tags ? ' [' + tags + ']' : ''}${desc}`;
    })
    .join('\n');

  const groupsForPrompt = [
    ...interpretation.detectedItems.map((d) => ({
      label: d.label,
      brief: `${d.description}. style:${d.style?.join(',') ?? ''} era:${d.era ?? ''} materials:${d.materials?.join(',') ?? ''} colors:${d.colors?.join(',') ?? ''}`,
    })),
    ...interpretation.suggestedAdditions.map((a) => ({
      label: `tasteful addition: ${a.label}`,
      brief: a.reason,
    })),
  ];

  const userBlocks: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: [
        query?.trim() ? `USER BRIEF: ${query.trim()}\n` : '',
        `MOODBOARD SUMMARY: ${interpretation.overall.summary}\n`,
        `GROUPS TO MATCH:\n${groupsForPrompt.map((g, i) => `${i + 1}. ${g.label} — ${g.brief}`).join('\n')}\n\n`,
        `CANDIDATE POOL (${poolMap.size} items):\n${poolText}`,
      ].join(''),
    },
  ];
  for (const a of attachments) {
    if (a.kind === 'image') userBlocks.push({ type: 'image_url', image_url: { url: a.dataUrl } });
    else if (a.kind === 'pdf') userBlocks.push({ type: 'file', file: { filename: a.filename, file_data: a.dataUrl } });
  }

  const content = await callOpenRouter({
    model: SONNET,
    max_tokens: 3000,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: [{ type: 'text', text: SONNET_RERANK_SYSTEM, cache_control: { type: 'ephemeral' } }] },
      { role: 'user', content: userBlocks },
    ],
  });
  const parsed = safeParseJson<{ groups?: Array<{ label: unknown; ids: unknown }>; explanation?: unknown }>(content) ?? {};
  const allowed = new Set(poolMap.keys());
  const acc: MatchAccumulator = new Map();
  const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
  groups.forEach((g) => {
    const label = typeof g.label === 'string' ? g.label : '';
    if (!label) return;
    const ids = Array.isArray(g.ids)
      ? (g.ids.filter((x) => typeof x === 'string' && allowed.has(x as string)) as string[]).slice(0, 6)
      : [];
    ids.forEach((id, rank) => {
      const entry = poolMap.get(id);
      if (entry) addMatch(acc, entry.item, label, 1 - rank / 10);
    });
  });

  const explanation = typeof parsed.explanation === 'string' && parsed.explanation
    ? parsed.explanation
    : interpretation.overall.summary;

  return {
    query,
    mode: 'haiku-then-sonnet',
    modelsUsed: [modelUsed, SONNET],
    interpretation,
    matches: flattenMatches(acc),
    explanation,
  };
}

// --- dispatcher ----------------------------------------------------------

export async function runSearch(input: {
  query?: string;
  attachments: Attachment[];
  mode: SearchMode;
}): Promise<SearchResponse> {
  const { query, attachments, mode } = input;

  // text mode: no attachments needed (and ignored if provided)
  if (mode === 'text' || attachments.length === 0) {
    const q = (query ?? '').trim();
    if (!q) {
      return { query, mode: 'text', modelsUsed: [], matches: [], explanation: 'Provide a text query or attach a moodboard.' };
    }
    return runTextMode(q);
  }

  if (mode === 'haiku' || mode === 'sonnet') return runVisionMode(attachments, query, mode);
  if (mode === 'haiku-then-sonnet') return runHaikuThenSonnet(attachments, query);

  // Unknown mode: fall back to text.
  return runTextMode((query ?? '').trim());
}
