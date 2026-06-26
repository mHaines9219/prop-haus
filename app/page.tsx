import Link from 'next/link';
import { categoryCounts, loadCatalog } from '@/lib/catalog';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { SOURCE_META, type Source } from '@/lib/types';
import { ItemCard } from '@/components/item-card';
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
  const vendors = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const activeCategories = CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0);

  return (
    <>
      {/* Hero — full-bleed dark band */}
      <section className="relative -mt-8 ml-[50%] w-screen -translate-x-1/2 overflow-hidden bg-ink text-paper">
        {heroBg && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.06]"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
        )}
        <div className="relative mx-auto max-w-2xl px-4 py-20 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40 mb-6">
            AI-Assisted Prop Sourcing
          </p>
          <h1 className="font-display text-5xl md:text-6xl font-light leading-[1.05] tracking-tight mb-10">
            Source anything.
            <br />
            <span className="text-brass">From anywhere.</span>
          </h1>
          <SearchBar large />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <Link
                key={s}
                href={`/search?q=${encodeURIComponent(s)}`}
                className="font-mono text-[11px] text-paper/50 border border-paper/15 px-3 py-1.5 transition hover:border-paper/40 hover:text-paper"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Browse — sidebar + grid */}
      <div className="flex gap-10 pt-10">
        <aside className="hidden w-52 shrink-0 space-y-8 md:block">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">City</p>
            <div className="border border-ink/15 bg-card px-3 py-2 text-sm">Los Angeles, CA</div>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">Category</p>
            <div className="space-y-0.5">
              {activeCategories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[13px] text-ink transition hover:bg-muted"
                >
                  <span>{categoryName(c.slug)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{counts[c.slug]}</span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">Vendor</p>
            <div className="space-y-0.5">
              {vendors.map(([id, n]) => (
                <a
                  key={id}
                  href={SOURCE_META[id].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[13px] text-ink/75 transition hover:bg-muted hover:text-ink"
                >
                  <span className="truncate">{SOURCE_META[id].name}</span>
                  <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">{n}</span>
                </a>
              ))}
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1">
          <div className="mb-6 flex items-center justify-between">
            <p className="font-mono text-xs text-muted-foreground">
              Featured — {catalog.length.toLocaleString()} items across {vendorCounts.size} vendors
            </p>
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
            {featured.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
