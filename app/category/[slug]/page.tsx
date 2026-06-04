import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getByCategory } from '@/lib/catalog';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { ItemCard } from '@/components/item-card';

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const valid = CATEGORIES.find((c) => c.slug === slug);
  if (!valid) notFound();
  const items = await getByCategory(slug);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <Link href="/" className="font-sans text-xs uppercase tracking-widest text-ink/50">
            ← Catalog
          </Link>
          <h1 className="font-display text-4xl mt-2">{categoryName(slug)}</h1>
          <p className="font-sans text-sm text-ink/60 mt-1">{items.length} items</p>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="font-sans text-ink/60">No items in this category yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
