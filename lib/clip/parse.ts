import * as cheerio from 'cheerio';
import { hostnameLabel, retailerNameFor, retailerRuleFor } from './retailers';

/**
 * Turn a product-listing page into a preview (MVP-7 clip extractor).
 *
 * Pure function — no network, no DB — so it unit-tests against saved HTML
 * fixtures. The route (app/api/clip) owns fetching (with the SSRF guard),
 * canonicalization, and image snapshotting; this file only reads HTML.
 *
 * Extraction is a ladder, first hit wins PER FIELD (so a listing can get its
 * name from JSON-LD and its price from OpenGraph):
 *   1. JSON-LD `Product` — the richest source; retailers publish name/image/
 *      offers here. Handles `@graph` arrays and `@type` arrays.
 *   2. OpenGraph / Twitter meta tags.
 *   3. Fallback: <title> for the name, largest declared <img> for the image.
 * A per-retailer rule (retailers.ts) then refines the image and names the
 * retailer.
 */

export type ClipPreview = {
  name: string;
  image?: string;
  sourceUrl: string;
  retailer: string;
  price?: { amount: number; currency: string };
  description?: string;
};

type Draft = {
  name?: string;
  image?: string;
  description?: string;
  price?: { amount: number; currency: string };
};

export function parseListing(html: string, url: string): ClipPreview | null {
  const $ = cheerio.load(html);

  const draft: Draft = {};
  fillFrom(draft, fromJsonLd($));
  fillFrom(draft, fromMetaTags($));
  fillFrom(draft, fromFallback($));

  // A clip is only useful with at least a name. No name from any tier means the
  // page was unparseable (a bot wall, an SPA shell) — the caller treats null as
  // "unreadable" and offers manual entry.
  if (!draft.name) return null;

  const rule = retailerRuleFor(url);
  const image = draft.image && rule?.refineImage ? rule.refineImage(draft.image) : draft.image;

  return {
    name: clamp(draft.name, 300),
    ...(image ? { image } : {}),
    sourceUrl: url,
    retailer: retailerNameFor(url),
    ...(draft.price ? { price: draft.price } : {}),
    ...(draft.description ? { description: clamp(draft.description, 4000) } : {}),
  };
}

/** Copy only the fields the draft is still missing — preserves first-hit-wins. */
function fillFrom(draft: Draft, next: Draft): void {
  if (!draft.name && next.name) draft.name = next.name;
  if (!draft.image && next.image) draft.image = next.image;
  if (!draft.description && next.description) draft.description = next.description;
  if (!draft.price && next.price) draft.price = next.price;
}

// ---------- Tier 1: JSON-LD ----------

function fromJsonLd($: cheerio.CheerioAPI): Draft {
  const nodes: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // a broken block shouldn't sink the whole parse
    }
    collectNodes(parsed, nodes);
  });

  const product = nodes.find((n) => hasType(n, 'Product'));
  if (!product) return {};

  const draft: Draft = {};
  if (typeof product.name === 'string') draft.name = product.name.trim();
  if (typeof product.description === 'string') draft.description = product.description.trim();
  const image = firstImage(product.image);
  if (image) draft.image = image;
  const price = firstOffer(product.offers);
  if (price) draft.price = price;
  return draft;
}

/** Flatten JSON-LD (objects, arrays, `@graph`) into a flat list of nodes. */
function collectNodes(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectNodes(v, out);
    return;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    out.push(obj);
    if (Array.isArray(obj['@graph'])) collectNodes(obj['@graph'], out);
  }
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t === type;
  if (Array.isArray(t)) return t.includes(type);
  return false;
}

/** JSON-LD `image` can be a string, an array, or an ImageObject with `.url`. */
function firstImage(image: unknown): string | undefined {
  if (typeof image === 'string') return image.trim() || undefined;
  if (Array.isArray(image)) {
    for (const entry of image) {
      const found = firstImage(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (image && typeof image === 'object') {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === 'string') return url.trim() || undefined;
  }
  return undefined;
}

/** JSON-LD `offers` can be an Offer, an array of Offers, or an AggregateOffer. */
function firstOffer(offers: unknown): { amount: number; currency: string } | undefined {
  if (!offers) return undefined;
  if (Array.isArray(offers)) {
    for (const o of offers) {
      const found = firstOffer(o);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof offers !== 'object') return undefined;
  const o = offers as Record<string, unknown>;
  const raw = o.price ?? o.lowPrice ?? o.highPrice;
  const amount = toAmount(raw);
  if (amount === undefined) return undefined;
  const currency = typeof o.priceCurrency === 'string' ? o.priceCurrency : 'USD';
  return { amount, currency };
}

// ---------- Tier 2: OpenGraph / Twitter ----------

function fromMetaTags($: cheerio.CheerioAPI): Draft {
  const meta = (selectors: string[]): string | undefined => {
    for (const sel of selectors) {
      const content = $(sel).attr('content');
      if (content && content.trim()) return content.trim();
    }
    return undefined;
  };

  const draft: Draft = {};
  const name = meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
  if (name) draft.name = name;
  const image = meta([
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ]);
  if (image) draft.image = image;
  const description = meta([
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);
  if (description) draft.description = description;

  const amount = toAmount(
    meta(['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]']),
  );
  if (amount !== undefined) {
    const currency =
      meta(['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]']) ??
      'USD';
    draft.price = { amount, currency };
  }
  return draft;
}

// ---------- Tier 3: <title> + largest <img> ----------

function fromFallback($: cheerio.CheerioAPI): Draft {
  const draft: Draft = {};
  const title = $('title').first().text().trim();
  if (title) draft.name = title;

  let best: { url: string; area: number } | undefined;
  $('img').each((_, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src');
    if (!src || src.startsWith('data:')) return;
    const w = Number($(el).attr('width')) || 0;
    const h = Number($(el).attr('height')) || 0;
    const area = w * h;
    if (!best || area > best.area) best = { url: src.trim(), area };
  });
  if (best) draft.image = best.url;
  return draft;
}

// ---------- shared ----------

/** Coerce a price that may arrive as `"1,299.00"`, `1299`, or `"$1,299"`. */
function toAmount(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export { hostnameLabel };
