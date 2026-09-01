/**
 * Per-retailer quirks for the clip parser (MVP-7).
 *
 * The generic JSON-LD / OpenGraph ladder in parse.ts handles most listings.
 * This table is for the places a specific retailer needs a nudge: a nicer
 * display name than the bare hostname, or an image-URL transform to reach a
 * higher-res asset. Keyed by hostname suffix so `www.wayfair.com` and
 * `wayfair.com` both match.
 */

export type RetailerRule = {
  /** Matched against the URL hostname via suffix (`endsWith`). */
  hostname: string;
  /** Display name shown on the folder row instead of the raw hostname. */
  retailer: string;
  /** Optional transform to upgrade/clean a chosen image URL. */
  refineImage?: (imageUrl: string) => string;
};

const RULES: RetailerRule[] = [
  {
    hostname: 'wayfair.com',
    retailer: 'Wayfair',
    // Wayfair serves images off assets.wfcdn.com with a `?resize=...` (and
    // other) query that downscales them. Dropping the query returns the
    // original full-res asset. Leave non-wfcdn images untouched.
    refineImage: (imageUrl) => {
      try {
        const u = new URL(imageUrl);
        if (u.hostname.endsWith('wfcdn.com')) {
          u.search = '';
          return u.toString();
        }
      } catch {
        /* fall through to the original */
      }
      return imageUrl;
    },
  },
];

/** The rule for a URL's host, or undefined when we have no override. */
export function retailerRuleFor(url: string): RetailerRule | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  return RULES.find((r) => host === r.hostname || host.endsWith(`.${r.hostname}`));
}

/** Human-facing retailer name for a URL: override → bare hostname (www stripped). */
export function retailerNameFor(url: string): string {
  const rule = retailerRuleFor(url);
  if (rule) return rule.retailer;
  return hostnameLabel(url);
}

/** `https://www.example.com/x` → `example.com`. Falls back to the raw string. */
export function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Query keys that only track the click, never identify the product. Stripped so
// the same listing shared with different UTM tags dedupes to one clip.
const TRACKING_PARAMS = [
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'referrer',
  'source',
  '_branch_match_id',
];

/**
 * Canonical form of a product URL: lowercased host, no fragment, tracking
 * params removed. This is a clip's identity (sourceId) — two pastes of the same
 * listing must produce the same string so the folder's unique index dedupes
 * them. Returns the input unchanged if it can't be parsed.
 */
export function canonicalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  u.hostname = u.hostname.toLowerCase();
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.includes(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }
  return u.toString();
}
