import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { categoryCards } from '@/lib/catalog-db';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { ItemCard } from '@/components/ap/item-card';
import { PageShell } from '@/components/ap/page-shell';
import { GridCell, SeamGrid } from '@/components/ap/seam-grid';

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
    <PageShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          Catalog
        </Link>

        <div className="mt-6">
          <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
            Category
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {categoryName(slug)}
          </h1>
          <p className="mt-2 font-mono text-[13px] leading-[18px] text-text-tertiary">
            {total.toLocaleString()} item{total === 1 ? '' : 's'}
            {total > items.length ? ` — showing the first ${items.length}` : ''}
          </p>
        </div>

        <div className="mt-8">
          {items.length === 0 ? (
            <div className="border-y border-border py-16 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Nothing here yet
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                No items in this category yet.
              </p>
            </div>
          ) : (
            <SeamGrid>
              {items.map((item, i) => (
                <GridCell key={item.id} index={i}>
                  <ItemCard item={item} />
                </GridCell>
              ))}
            </SeamGrid>
          )}
        </div>
      </div>
    </PageShell>
  );
}
