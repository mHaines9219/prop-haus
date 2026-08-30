import Link from 'next/link';
import { browseCards, catalogFacets } from '@/lib/catalog-db';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { SOURCE_META, type Source } from '@/lib/types';
import { BrowseGrid } from '@/components/ap/browse-grid';
import { HeroSearch } from '@/components/ap/hero-search';
import { SiteFooter } from '@/components/ap/site-footer';
import { SiteNav } from '@/components/ap/site-nav';

const SUGGESTIONS = [
  '70s apartment',
  'mid-century office',
  'luxury hotel lobby',
  'art deco speakeasy',
  'victorian drawing room',
];

// First surface migrated to the Answer Print design language (DESIGN.md).
// Legacy pages keep the Astryx chrome via app/(legacy)/layout.tsx.
export default async function HomePage() {
  // Counts come from the precomputed facet view rather than a live GROUP BY —
  // aggregating 90k rows per request exceeded the statement timeout at 3.2s.
  const [facets, featuredPage] = await Promise.all([catalogFacets(), browseCards({ limit: 12 })]);

  const featured = featuredPage.items;

  const vendors = Object.entries(facets.vendors)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: SOURCE_META[id as Source]?.name ?? id, count }));

  const categories = CATEGORIES.filter((c) => (facets.categories[c.slug] ?? 0) > 0).map((c) => ({
    slug: c.slug,
    name: categoryName(c.slug),
    count: facets.categories[c.slug] ?? 0,
  }));

  return (
    <div data-theme="answer-print" className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />
      <main className="flex-1">
        <section>
          <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-10 sm:px-6 md:pt-14">
            <div className="max-w-[880px]">
              <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                Los Angeles inventory
              </p>
              <h1 className="mt-5 font-display text-[40px] font-bold leading-[1.06] tracking-[-0.01em] [font-stretch:125%] [text-wrap:balance] md:text-[64px] md:leading-[68px]">
                Every prop house. <span className="md:block">One pull.</span>
              </h1>
              <div className="mt-9 max-w-[760px]">
                <HeroSearch />
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {SUGGESTIONS.map((s) => (
                  <Link
                    key={s}
                    href={`/search?q=${encodeURIComponent(s)}`}
                    className="font-mono text-[13px] leading-[18px] text-text-tertiary underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <BrowseGrid
          categories={categories}
          vendors={vendors}
          initialItems={featured}
          totalCatalog={facets.total}
          vendorCount={vendors.length}
          showMarquee
        />
      </main>
      <SiteFooter />
    </div>
  );
}
