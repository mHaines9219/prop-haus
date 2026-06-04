import Link from 'next/link';
import { categoryCounts, loadCatalog } from '@/lib/catalog';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { ItemCard } from '@/components/item-card';
import { SearchBar } from '@/components/search-bar';

export default async function HomePage() {
  const counts = await categoryCounts();
  const catalog = await loadCatalog();
  const featured = catalog
    .filter((i) => i.images.length > 0)
    .sort(() => Math.random() - 0.5)
    .slice(0, 12);

  return (
    <div className="space-y-12">
      <section className="text-center py-10 space-y-6">
        <h1 className="font-display text-5xl md:text-6xl tracking-tight">
          NYC Production Props, in one place.
        </h1>
        <p className="font-sans text-ink/70 max-w-xl mx-auto">
          Aggregated inventory from 3 NYC prop houses. Browse by category, ask AI for what you need,
          and build a request.
        </p>
        <SearchBar large />
      </section>

      <section>
        <h2 className="font-display text-2xl mb-6">Browse by category</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0).map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="border border-ink/20 p-4 hover:bg-ink hover:text-paper transition group"
            >
              <p className="font-display text-xl">{categoryName(c.slug)}</p>
              <p className="font-sans text-xs uppercase tracking-widest mt-2 text-ink/60 group-hover:text-paper/70">
                {counts[c.slug]} items
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl mb-6">Featured</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {featured.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
