import { z } from 'zod';

export const SOURCES = [
  'gilandroy',
  'hpr',
  'platinum',
  'omega',
  'artdimensions',
  'ec',
  'heritage',
  'historyforhire',
  'propheaven',
  'target',
  'rcvintage',
  'universal',
  'propserviceswest',
  'pina',
  'warnerbros',
  'objects',
  'alleycats',
  'alpha',
  'depict33',
  'iss',
  'premiere',
] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_META: Record<Source, { name: string; url: string }> = {
  gilandroy: { name: 'Gil & Roy Props', url: 'https://www.gilandroyprops.tv' },
  hpr: { name: 'Hand Prop Room', url: 'https://www.hpr.com' },
  platinum: { name: 'Platinum Prop House', url: 'https://platinumprophouse.com' },
  omega: { name: 'Omega Cinema Props', url: 'https://omegacinemaprops.com' },
  artdimensions: { name: 'Art Dimensions Inc.', url: 'https://www.theacme.com/directory/art-dimensions-inc' },
  ec: { name: 'EC Props', url: 'https://ecprops.com' },
  heritage: { name: 'Heritage Props LA', url: 'https://heritagepropsla.com' },
  historyforhire: { name: 'History For Hire', url: 'https://www.historyforhire.com' },
  propheaven: { name: 'Prop Heaven', url: 'https://www.propheaven.com' },
  target: { name: 'Target Props', url: 'https://targetprops.com' },
  rcvintage: { name: 'RC Vintage', url: 'https://www.rcvintage.com' },
  universal: { name: 'Universal Studios Property', url: 'https://props.universalstudios.com' },
  propserviceswest: { name: 'Prop Services West', url: 'https://propserviceswest.com' },
  pina: { name: 'Pina Props', url: 'https://pinaprops.com' },
  warnerbros: { name: 'Warner Bros. Property', url: 'https://property.warnerbros.com' },
  objects: { name: 'Ob-jects', url: 'https://www.ob-jects.com' },
  alleycats: { name: 'Alley Cats Props', url: 'https://www.alleycatsprops.com' },
  alpha: { name: 'Alpha Props', url: 'https://www.alphaprops.com' },
  depict33: { name: 'Depict 33', url: 'http://www.depict33.com' },
  iss: { name: 'ISS Props', url: 'https://props.issprops.com' },
  premiere: { name: 'Premiere Props', url: 'https://www.premiereprops.net' },
};

export const Dimensions = z.object({
  width: z.number().optional(),
  depth: z.number().optional(),
  height: z.number().optional(),
  unit: z.literal('in').default('in'),
});

export const VendorRef = z.object({
  id: z.enum(SOURCES),
  name: z.string(),
  city: z.literal('LA'),
  sourceUrl: z.string().url(),
});

// Rental price as published on the vendor's site. Present only for vendors that
// publish rates (e.g. WooCommerce rental shops); quote-only houses leave this
// undefined, which the app treats as "request a quote". `unit` is the rental
// period when the site states it — often unspecified, so it stays optional.
/**
 * Rental period vocabulary, shared by the catalog's published `Price` and the
 * vendor's negotiated `Quote` (lib/projects.ts) so both speak one language.
 * 'event' and 'purchase' are flat fees rather than recurring periods.
 */
export const PRICE_UNITS = ['day', 'week', 'month', 'event', 'purchase'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** Units billed once, not per period — periods is always 1. */
export const FLAT_FEE_UNITS: readonly PriceUnit[] = ['event', 'purchase'];

export const Price = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  unit: z.enum(PRICE_UNITS).optional(),
});
export type Price = z.infer<typeof Price>;

export const PropItem = z.object({
  id: z.string(),
  source: z.enum(SOURCES),
  sourceId: z.string(),
  name: z.string(),
  description: z.string().optional(),

  category: z.string(),
  subcategory: z.string().optional(),
  sourceCategoryPath: z.array(z.string()),

  // AI-search discriminators (filled by enrichment pass)
  style: z.array(z.string()).optional(),
  era: z.string().optional(),
  materials: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  vibes: z.array(z.string()).optional(),
  settingType: z.array(z.string()).optional(),
  genreFit: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),

  dimensions: Dimensions.optional(),
  price: Price.optional(),

  vendor: VendorRef,
  images: z.array(z.string().url()),
  sourceUrl: z.string().url(),
  scrapedAt: z.string(),
  // Computed at ingest (DESIGN.md §4). NULL/absent → falls back to 'cutout'.
  plateMode: z.enum(['cutout', 'photo']).optional(),
});
export type PropItem = z.infer<typeof PropItem>;

export const Catalog = z.array(PropItem);
export type Catalog = z.infer<typeof Catalog>;

// Minimal shape the grid/cards actually render. Extended beyond the original
// id/source/sourceId/name/subcategory/images to carry the fields the card
// placard and quick-add gesture need:
//   - category + sourceUrl: required by the cart store add() signature
//   - price + dimensions: the "camera report" data line (DESIGN.md §9.4.3)
//   - plateMode: wires the correct LightWell blend mode (DESIGN.md §4)
// PropItem is structurally assignable to CardItem.
export type CardItem = Pick<
  PropItem,
  | 'id'
  | 'source'
  | 'sourceId'
  | 'name'
  | 'subcategory'
  | 'images'
  | 'category'
  | 'sourceUrl'
  | 'price'
  | 'dimensions'
  | 'plateMode'
>;

// ---------- Multimodal Ask AI ----------

export const SEARCH_MODES = ['text', 'haiku', 'sonnet', 'haiku-then-sonnet'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export type Attachment = {
  kind: 'image' | 'pdf';
  mime: string;
  filename: string;
  dataUrl: string; // data:<mime>;base64,...
};

export type DetectedItem = {
  label: string;
  description: string;
  style?: string[];
  era?: string;
  materials?: string[];
  colors?: string[];
};

export type MoodboardInterpretation = {
  overall: {
    style: string[];
    era?: string;
    vibes: string[];
    settingType?: string[];
    summary: string;
  };
  detectedItems: DetectedItem[];
  suggestedAdditions: Array<{ label: string; reason: string }>;
};

export type SearchMatch = {
  item: PropItem;
  matchedVia: string[];
  score: number;
};

export type SearchResponse = {
  query?: string;
  mode: SearchMode;
  modelsUsed: string[];
  interpretation?: MoodboardInterpretation;
  matches: SearchMatch[];
  explanation?: string;
  error?: string;
};
