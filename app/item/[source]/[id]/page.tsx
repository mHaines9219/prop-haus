import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { getItemBySourceId, relatedCards } from '@/lib/catalog-db';
import { SOURCE_META, type PriceUnit } from '@/lib/types';
import { categoryName } from '@/lib/categories';
import { AddToCart } from '@/components/ap/add-to-cart';
import { ItemCard } from '@/components/ap/item-card';
import { ItemGallery } from '@/components/ap/item-gallery';
import { PageShell } from '@/components/ap/page-shell';
import { GridCell, SeamGrid } from '@/components/ap/seam-grid';

/**
 * ISR: the catalog only changes on a pipeline load, so each item page is
 * rendered once on first visit and served from the cache after that. Without
 * this the page was fully dynamic — every listing click paid a serverless
 * invocation plus two sequential Supabase round trips.
 *
 * The empty generateStaticParams is load-bearing: `revalidate` alone leaves a
 * dynamic-param route rendering per request (verified against `pnpm start` —
 * Cache-Control stayed no-store). Its presence is what opts unvisited paths
 * into on-demand static generation; prebuilding 90k item pages is not.
 */
export const revalidate = 86400;

export function generateStaticParams(): { source: string; id: string }[] {
  return [];
}

// Camera-report rental terms: the vendor's published figure in mono, period
// abbreviated to the glyph. Quote-only houses have no price and fall through.
const UNIT_ABBR: Record<PriceUnit, string> = {
  day: '/ DAY',
  week: '/ WK',
  month: '/ MO',
  event: 'FLAT',
  purchase: 'BUY',
};

export default async function ItemPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  const item = await getItemBySourceId(source, decodeURIComponent(id));
  if (!item) notFound();
  // Fetch one extra so removing the item itself still leaves a full row of 8.
  const related = (await relatedCards(item.category, 9))
    .filter((i) => i.id !== item.id)
    .slice(0, 8);
  const meta = SOURCE_META[item.source];
  const dims = item.dimensions;
  const hasDims = dims && (dims.width != null || dims.depth != null || dims.height != null);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href={`/category/${item.category}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          {categoryName(item.category)}
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ItemGallery images={item.images} name={item.name} />

          <div className="lg:pt-2">
            <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em] text-foreground">
              {item.name}
            </h1>
            <p className="mt-2 font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-secondary">
              Courtesy of {meta.name}
            </p>

            {item.subcategory && (
              <p className="mt-3 text-[13px] leading-[19px] text-text-tertiary">{item.subcategory}</p>
            )}

            {item.description && (
              <p className="mt-5 max-w-[60ch] text-[15px] leading-[22px] text-text-secondary">
                {item.description}
              </p>
            )}

            <dl className="mt-8 border-t border-border">
              {hasDims && (
                <SpecRow label="Dimensions">
                  <DimensionValue
                    width={dims!.width}
                    depth={dims!.depth}
                    height={dims!.height}
                    unit={(dims!.unit ?? 'in').toUpperCase()}
                  />
                </SpecRow>
              )}
              <SpecRow label="Category">{categoryName(item.category)}</SpecRow>
              <SpecRow label="Vendor">{meta.name}</SpecRow>
              <SpecRow label="Rental">
                {item.price ? (
                  <span className="font-semibold text-foreground">
                    ${item.price.amount.toFixed(2)}
                    {item.price.unit && (
                      <span className="ml-1 text-text-tertiary">{UNIT_ABBR[item.price.unit]}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-text-tertiary">Quote on request</span>
                )}
              </SpecRow>
            </dl>

            <div className="mt-8 space-y-3">
              <AddToCart item={item} />
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-border text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-popover hover:text-foreground"
              >
                View on {meta.name}
                <ExternalLink size={16} strokeWidth={1.5} aria-hidden />
              </a>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-5 text-[18px] font-semibold leading-[24px] text-foreground">
              More in {categoryName(item.category)}
            </h2>
            <SeamGrid>
              {related.map((r, i) => (
                <GridCell key={r.id} index={i}>
                  <ItemCard item={r} />
                </GridCell>
              ))}
            </SeamGrid>
          </section>
        )}
      </div>
    </PageShell>
  );
}

/** Hairline-ruled 44px spec row: label left, mono value right (DESIGN.md 9.5). */
function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 border-b border-border py-2.5">
      <dt className="text-[13px] leading-[18px] text-text-tertiary">{label}</dt>
      <dd className="text-right font-mono text-[13px] leading-[18px] text-foreground">{children}</dd>
    </div>
  );
}

/** `W 32 x D 30 x H 27 IN`, x glyphs in tertiary, values in primary (DESIGN.md 5). */
function DimensionValue({
  width,
  depth,
  height,
  unit,
}: {
  width?: number;
  depth?: number;
  height?: number;
  unit: string;
}) {
  const parts: Array<[string, number]> = [];
  if (width != null) parts.push(['W', width]);
  if (depth != null) parts.push(['D', depth]);
  if (height != null) parts.push(['H', height]);

  return (
    <span className="text-foreground">
      {parts.map(([axis, value], i) => (
        <span key={axis}>
          {i > 0 && <span className="text-text-tertiary"> x </span>}
          {axis} {value}
        </span>
      ))}
      <span className="text-text-tertiary"> {unit}</span>
    </span>
  );
}
