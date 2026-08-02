import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { MediaTheme } from '@astryxdesign/core/theme';
import { browseCards, catalogFacets } from '@/lib/catalog-db';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { SOURCE_META, type Source } from '@/lib/types';
import { BrowseGrid } from '@/components/browse-grid';
import { SearchBar } from '@/components/search-bar';

const SUGGESTIONS = [
  '70s apartment',
  'mid-century office',
  'luxury hotel lobby',
  'art deco speakeasy',
  'victorian drawing room',
];

export default async function HomePage() {
  // Counts come from the precomputed facet view rather than a live GROUP BY —
  // aggregating 90k rows per request exceeded the statement timeout at 3.2s.
  const [facets, featuredPage] = await Promise.all([catalogFacets(), browseCards({ limit: 12 })]);

  // Previously a random 12 out of the whole in-memory catalog. Sampling at
  // random across 90k rows costs a full scan, and the shuffle also made this
  // page uncacheable, so the featured strip is now the first page.
  const featured = featuredPage.items;
  const heroBg = featured[0]?.images[0];

  const vendors = Object.entries(facets.vendors)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: SOURCE_META[id as Source]?.name ?? id, count }));

  const categories = CATEGORIES.filter((c) => (facets.categories[c.slug] ?? 0) > 0).map((c) => ({
    slug: c.slug,
    name: categoryName(c.slug),
    count: facets.categories[c.slug] ?? 0,
  }));

  return (
    <>
      {/* Hero — full-bleed dark band. MediaTheme flips Astryx tokens to
          light-on-dark so headings/links read correctly over the dark surface. */}
      <section className="relative -mt-8 ml-[50%] w-screen -translate-x-1/2 overflow-hidden bg-[#1A1815]">
        {heroBg && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.06]"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
        )}
        <MediaTheme mode="dark">
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-20 text-center">
            <Text type="label" color="secondary">
              AI-Assisted Prop Sourcing
            </Text>
            <Heading level={1}>
              Source anything.
              <br />
              <Text as="span" color="accent">
                From anywhere.
              </Text>
            </Heading>
            <div className="w-full">
              <SearchBar large />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {SUGGESTIONS.map((s) => (
                <Link key={s} href={`/search?q=${encodeURIComponent(s)}`}>
                  {s}
                </Link>
              ))}
            </div>
          </div>
        </MediaTheme>
      </section>

      {/* Browse — dynamic sidebar filters + grid */}
      <BrowseGrid
        categories={categories}
        vendors={vendors}
        initialItems={featured}
        totalCatalog={facets.total}
        vendorCount={vendors.length}
      />
    </>
  );
}
