import type { CardItem, PropItem } from '@/lib/types';

/** A complete, schema-valid catalog item. Override what the test cares about. */
export function makePropItem(over: Partial<PropItem> = {}): PropItem {
  const source = over.source ?? 'omega';
  const sourceId = over.sourceId ?? '12345';
  return {
    id: `${source}-${sourceId}`,
    source,
    sourceId,
    name: 'Mid-century walnut credenza',
    description: 'Six-foot walnut credenza with brass pulls.',
    category: 'storage-credenzas',
    subcategory: 'credenzas',
    sourceCategoryPath: ['Furniture', 'Storage'],
    style: ['mid-century'],
    era: '1960s',
    materials: ['walnut', 'brass'],
    colors: ['brown'],
    vibes: ['warm'],
    tags: ['credenza', 'walnut'],
    dimensions: { width: 72, depth: 18, height: 30, unit: 'in' },
    price: { amount: 120, currency: 'USD', unit: 'week' },
    vendor: { id: source, name: 'Omega Cinema Props', city: 'LA', sourceUrl: 'https://omegacinemaprops.com' },
    images: ['https://omegacinemaprops.com/img/12345.jpg'],
    sourceUrl: 'https://omegacinemaprops.com/item/12345',
    scrapedAt: '2026-08-01T00:00:00.000Z',
    plateMode: 'cutout',
    ...over,
  };
}

export function makeCardItem(over: Partial<CardItem> = {}): CardItem {
  const full = makePropItem(over as Partial<PropItem>);
  return {
    id: full.id,
    source: full.source,
    sourceId: full.sourceId,
    name: full.name,
    subcategory: full.subcategory,
    images: full.images.slice(0, 1),
    category: full.category,
    sourceUrl: full.sourceUrl,
    price: full.price,
    dimensions: full.dimensions,
    plateMode: full.plateMode,
    ...over,
  };
}

/** The snake_case row shape the catalog tables return, for FakeSupabase seeds. */
export function catalogRow(over: Partial<PropItem> = {}): Record<string, unknown> {
  const it = makePropItem(over);
  return {
    id: it.id,
    source: it.source,
    source_id: it.sourceId,
    name: it.name,
    description: it.description ?? null,
    category: it.category,
    subcategory: it.subcategory ?? null,
    source_category_path: it.sourceCategoryPath,
    style: it.style ?? null,
    era: it.era ?? null,
    materials: it.materials ?? null,
    colors: it.colors ?? null,
    vibes: it.vibes ?? null,
    setting_type: it.settingType ?? null,
    genre_fit: it.genreFit ?? null,
    tags: it.tags ?? null,
    dimensions: it.dimensions ?? null,
    vendor: it.vendor,
    images: it.images,
    has_images: it.images.length > 0,
    source_url: it.sourceUrl,
    scraped_at: it.scrapedAt,
    price_amount: it.price ? String(it.price.amount) : null,
    price_currency: it.price?.currency ?? null,
    price_unit: it.price?.unit ?? null,
    plate_mode: it.plateMode ?? null,
  };
}
