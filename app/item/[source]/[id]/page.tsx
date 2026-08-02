import { notFound } from 'next/navigation';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Card } from '@astryxdesign/core/Card';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { Grid } from '@astryxdesign/core/Grid';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { getItemBySourceId, categoryCards } from '@/lib/catalog-db';
import { SOURCE_META } from '@/lib/types';
import { categoryName } from '@/lib/categories';
import { AddToCart } from '@/components/add-to-cart';
import { ItemCard } from '@/components/item-card';

export default async function ItemPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  const item = await getItemBySourceId(source, decodeURIComponent(id));
  if (!item) notFound();
  // Fetch one extra so removing the item itself still leaves a full row of 8.
  const related = (await categoryCards(item.category, 9)).items
    .filter((i) => i.id !== item.id)
    .slice(0, 8);
  const meta = SOURCE_META[item.source];
  const dims = item.dimensions;

  return (
    <div className="space-y-12">
      <Link href={`/category/${item.category}`}>← {categoryName(item.category)}</Link>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          {item.images[0] && (
            <Card padding={0}>
              <AspectRatio ratio={4 / 3} fit="cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.images[0]} alt={item.name} className="h-full w-full object-cover" />
              </AspectRatio>
            </Card>
          )}
          {item.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {item.images.slice(1, 9).map((src) => (
                <Thumbnail key={src} src={src} alt={item.name} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Text type="label" color="secondary">
              {meta.name}
            </Text>
            <Heading level={1}>{item.name}</Heading>
            {item.subcategory && <Text color="secondary">{item.subcategory}</Text>}
          </div>

          {item.description && <Text>{item.description}</Text>}

          {dims && (dims.width != null || dims.depth != null || dims.height != null) && (
            <MetadataList columns="multi">
              {dims.width != null && (
                <MetadataListItem label="Width">{dims.width}&quot;</MetadataListItem>
              )}
              {dims.depth != null && (
                <MetadataListItem label="Depth">{dims.depth}&quot;</MetadataListItem>
              )}
              {dims.height != null && (
                <MetadataListItem label="Height">{dims.height}&quot;</MetadataListItem>
              )}
            </MetadataList>
          )}

          <div className="flex items-center gap-4">
            <AddToCart item={item} />
            <Link href={item.sourceUrl} isExternalLink target="_blank" rel="noreferrer">
              View on {meta.name}
            </Link>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="space-y-4">
          <Heading level={2}>More in {categoryName(item.category)}</Heading>
          <Grid columns={{ minWidth: 200 }} gap={5}>
            {related.map((r) => (
              <ItemCard key={r.id} item={r} />
            ))}
          </Grid>
        </section>
      )}
    </div>
  );
}
