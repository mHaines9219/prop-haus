/**
 * The category page's filter rail, as data: which item attributes can narrow a
 * category, how each rides the URL, and how to build the links that toggle one.
 *
 * Shared by the server page (parsing `?era=1920s&style=industrial,nautical`)
 * and the client rail (building the href for each value), so the URL grammar
 * lives in exactly one place. Values within a group OR together (black or
 * gray); groups AND together (black-or-gray AND 1920s).
 */

export const ATTRIBUTE_GROUPS = [
  { key: 'era', column: 'era', label: 'Era', scalar: true },
  { key: 'style', column: 'style', label: 'Style', scalar: false },
  { key: 'vibes', column: 'vibes', label: 'Vibes', scalar: false },
  { key: 'materials', column: 'materials', label: 'Materials', scalar: false },
  { key: 'colors', column: 'colors', label: 'Colors', scalar: false },
  { key: 'setting', column: 'setting_type', label: 'Setting', scalar: false },
  { key: 'genre', column: 'genre_fit', label: 'Genre fit', scalar: false },
  { key: 'tags', column: 'tags', label: 'Tags', scalar: false },
] as const;

export type AttributeKey = (typeof ATTRIBUTE_GROUPS)[number]['key'];
export type AttributeColumn = (typeof ATTRIBUTE_GROUPS)[number]['column'];

/** Selected values per group. A group with nothing selected is simply absent. */
export type AttributeFilters = Partial<Record<AttributeKey, string[]>>;

/** One value of one attribute and how many items in the category carry it. */
export type FacetValue = { value: string; n: number };
export type AttributeFacets = Record<AttributeKey, FacetValue[]>;

export const EMPTY_FACETS: AttributeFacets = {
  era: [],
  style: [],
  vibes: [],
  materials: [],
  colors: [],
  setting: [],
  genre: [],
  tags: [],
};

/** Longest value the URL will carry per selection; enum slugs are far shorter. */
const VALUE_MAX = 60;
/** Most selections one group accepts from the URL. */
const PER_GROUP_MAX = 12;

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** `style=industrial,nautical` → `['industrial', 'nautical']`, trimmed, deduped, capped. */
export function parseFilters(params: RawParams): AttributeFilters {
  const out: AttributeFilters = {};
  for (const g of ATTRIBUTE_GROUPS) {
    const raw = first(params[g.key]);
    if (!raw) continue;
    const values = [...new Set(raw.split(',').map((s) => s.trim().slice(0, VALUE_MAX)).filter(Boolean))].slice(
      0,
      PER_GROUP_MAX,
    );
    if (values.length) out[g.key] = values;
  }
  return out;
}

export function countSelected(filters: AttributeFilters): number {
  return Object.values(filters).reduce((n, v) => n + (v?.length ?? 0), 0);
}

/** The category page URL for a query and a set of filters. No `?` when both are empty. */
export function categoryHref(slug: string, state: { q?: string; filters?: AttributeFilters }): string {
  const p = new URLSearchParams();
  const q = state.q?.trim();
  if (q) p.set('q', q);
  for (const g of ATTRIBUTE_GROUPS) {
    const values = state.filters?.[g.key];
    if (values?.length) p.set(g.key, values.join(','));
  }
  const qs = p.toString();
  return qs ? `/category/${slug}?${qs}` : `/category/${slug}`;
}

/** The same filters with one value added or removed. */
export function toggleFilter(filters: AttributeFilters, key: AttributeKey, value: string): AttributeFilters {
  const current = filters[key] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const out: AttributeFilters = { ...filters };
  if (next.length) out[key] = next;
  else delete out[key];
  return out;
}
