import { writeSource, normalize, type RawItem } from './common/run';
import { parseLimitArg } from './common/fetch';

// Independent Studio Services (ISS) Props.
// The site is an Astro SPA backed by an Astro Actions endpoint at
//   POST /_actions/callISSApi    body: { search:"group", value:"<GROUP>", page:N }
// The response is in Astro's flat "devalue" reference format — a single array
// where index 0 is the root and other indices are referenced positionally.

const SOURCE = 'iss' as const;
const BASE = 'https://props.issprops.com';
const ACTION_URL = `${BASE}/_actions/callISSApi`;
const UA =
  'Mozilla/5.0 (compatible; prop-haus-mvp/0.1; +https://example.invalid/prop-haus) research-prototype';

// Top-level groups derived from the homepage sidebar.
const GROUPS: Array<{ code: string; label: string }> = [
  { code: 'ANML', label: 'Animal' },
  { code: 'AVIA', label: 'Aviation' },
  { code: 'BUSI', label: 'Business and Education' },
  { code: 'ELEC', label: 'Electronics, Photo, Tech' },
  { code: 'HOME', label: 'Home' },
  { code: 'JEWL', label: 'Jewelry & Accessories' },
  { code: 'LUGG', label: 'Luggage, Cases & Containers' },
  { code: 'MEDI', label: 'Medical & Lab' },
  { code: 'MISC', label: 'Misc' },
  { code: 'MUSC', label: 'Music' },
  { code: 'SETD', label: 'Set Dressing' },
  { code: 'SPRT', label: 'Sport & Recreation' },
  { code: 'STNT', label: 'Stunts' },
  { code: 'TACT', label: 'Tactical, Police, Military' },
  { code: 'TOOL', label: 'Tools, Automotive' },
  { code: 'VICE', label: 'Vice' },
  { code: 'WEPN', label: 'Weapons' },
];

type Decoded = unknown;

// Decode Astro/devalue flat reference array into a real JS object.
function devalue(input: unknown[]): Decoded {
  const seen = new Map<number, unknown>();
  function go(idx: number, seenInStack: Set<number>): unknown {
    if (seen.has(idx)) return seen.get(idx);
    if (seenInStack.has(idx)) return undefined;
    seenInStack.add(idx);
    const v = (input as unknown[])[idx];
    let out: unknown;
    if (Array.isArray(v)) {
      const arr: unknown[] = [];
      seen.set(idx, arr);
      for (const ref of v) {
        arr.push(typeof ref === 'number' ? go(ref, seenInStack) : ref);
      }
      out = arr;
    } else if (v && typeof v === 'object') {
      const obj: Record<string, unknown> = {};
      seen.set(idx, obj);
      for (const [k, ref] of Object.entries(v as Record<string, unknown>)) {
        obj[k] = typeof ref === 'number' ? go(ref, seenInStack) : ref;
      }
      out = obj;
    } else {
      out = v;
      seen.set(idx, out);
    }
    seenInStack.delete(idx);
    return out;
  }
  return go(0, new Set());
}

type IssItem = {
  _id?: string;
  code?: string;
  description?: string;
  img?: string | string[] | null;
  classification?: { group?: string; class?: string; type?: string };
  location?: string;
  tags?: string[];
};

async function callApi(body: Record<string, unknown>): Promise<IssItem[] | null> {
  const res = await fetch(ACTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const root = devalue(parsed) as { result?: IssItem[] } | undefined;
  if (!root || !Array.isArray(root.result)) return null;
  return root.result;
}

function cleanName(desc: string | undefined): string {
  if (!desc) return '';
  // ISS descriptions look like: "BUTTER DISH-N.D., METAL, GOLD, 8" LONG, ..."
  // Take the part before the first "-" or ",".
  const head = desc.split(/[-,]/)[0].trim();
  if (!head) return desc.trim().slice(0, 80);
  return head
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const MAX_PAGES_PER_GROUP = 15;
const PAGE_CONCURRENCY = 4;

async function fetchPagesConcurrent(group: string, pages: number[]): Promise<Array<IssItem[] | null>> {
  const results: Array<IssItem[] | null> = new Array(pages.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= pages.length) return;
      try {
        results[idx] = await callApi({ search: 'group', value: group, page: pages[idx] });
      } catch {
        results[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));
  return results;
}

async function fetchGroup(
  group: { code: string; label: string },
  hardLimit?: number,
): Promise<RawItem[]> {
  const out: RawItem[] = [];
  const seenIds = new Set<string>();
  const pages = Array.from({ length: MAX_PAGES_PER_GROUP }, (_, i) => i + 1);
  const pageResults = await fetchPagesConcurrent(group.code, pages);
  for (const items of pageResults) {
    if (!items || items.length === 0) continue;
    for (const it of items) {
      const id = it._id || it.code;
      if (!id) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const imgs = Array.isArray(it.img)
        ? it.img.filter((x): x is string => typeof x === 'string')
        : typeof it.img === 'string'
        ? [it.img]
        : [];
      if (imgs.length === 0) continue;
      const name = cleanName(it.description) || group.label;
      const cls = it.classification || {};
      const breadcrumb = [group.label];
      if (cls.class) breadcrumb.push(cls.class);
      if (cls.type) breadcrumb.push(cls.type);
      out.push({
        source: SOURCE,
        sourceId: id,
        name,
        description: it.description,
        sourceCategoryPath: breadcrumb,
        images: imgs,
        sourceUrl: `${BASE}/?group=${group.code}${cls.class ? `&class=${cls.class}` : ''}${cls.type ? `&type=${cls.type}` : ''}`,
      });
      if (hardLimit && out.length >= hardLimit) return out;
    }
  }
  return out;
}

async function main() {
  const limit = parseLimitArg();
  const all: RawItem[] = [];
  for (const g of GROUPS) {
    const remaining = limit ? Math.max(0, limit - all.length) : undefined;
    if (remaining === 0) break;
    const items = await fetchGroup(g, remaining);
    console.log(`  ${g.code} (${g.label}): ${items.length}`);
    all.push(...items);
    if (limit && all.length >= limit) break;
  }
  const out = [];
  for (const r of all) {
    try {
      out.push(normalize(r));
    } catch (e) {
      console.warn(`  skip ${r.sourceId}: ${(e as Error).message}`);
    }
  }
  await writeSource(SOURCE, out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
