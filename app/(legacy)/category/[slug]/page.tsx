import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Grid } from '@astryxdesign/core/Grid';
import { categoryCards } from '@/lib/catalog-db';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { ItemCard } from '@/components/item-card';

/**
 * How many cards this page renders. It used to render every item in the
 * category — 4,756 for `seating` — which was never a deliberate design and is
 * not expressible as one query anyway. The count in the header is still the
 * true total; the filterable grid on the home page is the way to reach the rest.
 */
const RENDER_LIMIT = 120;

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const valid = CATEGORIES.find((c) => c.slug === slug);
  if (!valid) notFound();
  const { items, total } = await categoryCards(slug, RENDER_LIMIT);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/">← Catalog</Link>
        <Heading level={1}>{categoryName(slug)}</Heading>
        <Text color="secondary">
          {total.toLocaleString()} items
          {total > items.length ? ` — showing the first ${items.length}` : ''}
        </Text>
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
