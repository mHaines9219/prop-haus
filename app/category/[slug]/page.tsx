import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Grid } from '@astryxdesign/core/Grid';
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
      <header className="space-y-2">
        <Link href="/">← Catalog</Link>
        <Heading level={1}>{categoryName(slug)}</Heading>
        <Text color="secondary">{items.length} items</Text>
      </header>
      {items.length === 0 ? (
        <Text color="secondary">No items in this category yet.</Text>
      ) : (
        <Grid columns={{ minWidth: 200 }} gap={5}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </Grid>
      )}
    </div>
  );
}
