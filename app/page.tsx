import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { MediaTheme } from '@astryxdesign/core/theme';
import { categoryCounts, loadCatalog } from '@/lib/catalog';
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
  const counts = await categoryCounts();
  const catalog = await loadCatalog();

  const featured = catalog
    .filter((i) => i.images.length > 0)
    .sort(() => Math.random() - 0.5)
    .slice(0, 12);

  const heroBg = featured[0]?.images[0];

  const vendorCounts = new Map<Source, number>();
  for (const i of catalog) vendorCounts.set(i.source, (vendorCounts.get(i.source) ?? 0) + 1);
  const vendors = [...vendorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: SOURCE_META[id].name, count }));

  const categories = CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0).map((c) => ({
    slug: c.slug,
    name: categoryName(c.slug),
    count: counts[c.slug] ?? 0,
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
        totalCatalog={catalog.length}
        vendorCount={vendorCounts.size}
      />
    </>
  );
}
