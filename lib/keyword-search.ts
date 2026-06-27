import type { PropItem, SearchMatch } from './types';
import { SOURCE_META } from './types';

/**
 * Fast, deterministic keyword/metadata search — no LLM, no embeddings.
 *
 * This is the literal counterpart to AI search: where AI *interprets* a brief and
 * curates a whole set, this just returns items whose metadata literally matches the
 * words typed ("couch", "blue couch", "mid century"). The two don't collide — one
 * suggests, the other looks things up.
 */

// Field weights — higher = stronger signal that the item is what the user meant.
const FIELDS: Array<{
  key: keyof PropItem;
  weight: number;
  /** whether a match here is worth showing as a "matched via" tag chip */
  chip: boolean;
}> = [
  { key: 'name', weight: 6, chip: false }, // already the card title
  { key: 'subcategory', weight: 5, chip: true },
  { key: 'category', weight: 4, chip: true },
  { key: 'tags', weight: 4, chip: true },
  { key: 'style', weight: 4, chip: true },
  { key: 'colors', weight: 4, chip: true },
  { key: 'materials', weight: 4, chip: true },
  { key: 'era', weight: 4, chip: true },
  { key: 'vibes', weight: 3, chip: true },
  { key: 'settingType', weight: 3, chip: true },
  { key: 'genreFit', weight: 2, chip: true },
  { key: 'description', weight: 1, chip: false }, // too long for a chip
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(query: string): string[] {
  return normalize(query)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Pull every searchable string value off an item, tagged with its source field. */
function fieldValues(item: PropItem): Array<{ field: (typeof FIELDS)[number]; raw: string; norm: string }> {
  const out: Array<{ field: (typeof FIELDS)[number]; raw: string; norm: string }> = [];
  for (const field of FIELDS) {
    const v = item[field.key];
    if (typeof v === 'string') {
      out.push({ field, raw: v, norm: normalize(v) });
    } else if (Array.isArray(v)) {
      for (const entry of v) {
        if (typeof entry === 'string') out.push({ field, raw: entry, norm: normalize(entry) });
      }
    }
  }
  // Vendor name is searchable too (e.g. "newel"), but low-weight and not a chip.
  const vendorName = SOURCE_META[item.source]?.name;
  if (vendorName) {
    out.push({ field: { key: 'source', weight: 1, chip: false }, raw: vendorName, norm: normalize(vendorName) });
  }
  return out;
}

export type KeywordOptions = {
  /** Max results to return. */
  limit?: number;
};

/**
 * Score `items` against `query`. A result is only included if *every* query token
 * matches at least one field (AND semantics) — so "blue couch" returns blue couches,
 * not everything blue or every couch.
 */
export function keywordSearch(
  items: PropItem[],
  query: string,
  opts: KeywordOptions = {},
): SearchMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const phrase = normalize(query);

  const results: SearchMatch[] = [];

  for (const item of items) {
    const values = fieldValues(item);
    let score = 0;
    const matchedValues = new Map<string, number>(); // raw value -> best weight
    let allTokensMatched = true;

    for (const token of tokens) {
      let tokenBest = 0;
      let tokenMatched = false;
      for (const { field, raw, norm } of values) {
        if (!norm.includes(token)) continue;
        tokenMatched = true;
        // Whole-word / exact-value matches beat mid-string substring matches.
        const exact = norm === token;
        const wordBoundary = new RegExp(`\\b${escapeRegExp(token)}\\b`).test(norm);
        const w = field.weight * (exact ? 2.5 : wordBoundary ? 1.5 : 1);
        if (w > tokenBest) tokenBest = w;
        if (field.chip) {
          const prev = matchedValues.get(raw) ?? 0;
          if (field.weight > prev) matchedValues.set(raw, field.weight);
        }
      }
      if (!tokenMatched) {
        allTokensMatched = false;
        break;
      }
      score += tokenBest;
    }

    if (!allTokensMatched) continue;

    // Bonus: the full phrase appears verbatim in some field (e.g. "mid century").
    if (tokens.length > 1 && values.some((v) => v.norm.includes(phrase))) {
      score += 8;
    }

    const matchedVia = [...matchedValues.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([raw]) => raw)
      .slice(0, 4);

    results.push({ item, matchedVia, score });
  }

  results.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return typeof opts.limit === 'number' ? results.slice(0, opts.limit) : results;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
