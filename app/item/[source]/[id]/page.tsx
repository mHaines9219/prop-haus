import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getItem, getByCategory } from '@/lib/catalog';
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
  const item = await getItem(source, decodeURIComponent(id));
  if (!item) notFound();
  const related = (await getByCategory(item.category)).filter((i) => i.id !== item.id).slice(0, 8);
  const meta = SOURCE_META[item.source];

  return (
    <div className="space-y-12">
      <Link
        href={`/category/${item.category}`}
        className="font-sans text-xs uppercase tracking-widest text-ink/50"
      >
        ← {categoryName(item.category)}
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-3">
          {item.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.images[0]} alt={item.name} className="w-full bg-ink/5 object-cover" />
          )}
          {item.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {item.images.slice(1, 9).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="aspect-square object-cover bg-ink/5" />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <p className="font-sans text-xs uppercase tracking-widest text-ink/50">{meta.name}</p>
            <h1 className="font-display text-4xl mt-2">{item.name}</h1>
            {item.subcategory && (
              <p className="font-sans text-sm text-ink/60 mt-1">{item.subcategory}</p>
            )}
          </div>

          {item.description && <p className="font-sans text-sm leading-relaxed">{item.description}</p>}

          {item.dimensions && (
            <dl className="grid grid-cols-3 gap-3 font-sans text-sm">
              {item.dimensions.width != null && (
                <div>
                  <dt className="uppercase text-[10px] tracking-widest text-ink/50">Width</dt>
                  <dd>{item.dimensions.width}&quot;</dd>
                </div>
              )}
              {item.dimensions.depth != null && (
                <div>
                  <dt className="uppercase text-[10px] tracking-widest text-ink/50">Depth</dt>
                  <dd>{item.dimensions.depth}&quot;</dd>
                </div>
              )}
              {item.dimensions.height != null && (
                <div>
                  <dt className="uppercase text-[10px] tracking-widest text-ink/50">Height</dt>
                  <dd>{item.dimensions.height}&quot;</dd>
                </div>
              )}
            </dl>
          )}

          <div className="flex items-center gap-4">
            <AddToCart item={item} />
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-sans uppercase tracking-widest text-sm underline text-ink/70"
            >
              View on {meta.name} ↗
            </a>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl">More in {categoryName(item.category)}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {related.map((r) => (
              <ItemCard key={r.id} item={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
