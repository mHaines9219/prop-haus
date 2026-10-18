import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  categoryAttributeFacets,
  categoryCards,
  filterCategoryCards,
  type BrowsePage,
  type CategoryPage as NarrowedPage,
} from '@/lib/catalog-db';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { categoryHref, countSelected, parseFilters, type AttributeFilters } from '@/lib/category-filters';
import type { CardItem } from '@/lib/types';
import { CategoryFilters } from '@/components/ap/category-filters';
import { CategorySearch } from '@/components/ap/category-search';
import { ItemCard } from '@/components/ap/item-card';
import { PageShell } from '@/components/ap/page-shell';
import { GridCell, SeamGrid } from '@/components/ap/seam-grid';

const RENDER_LIMIT = 120;
const QUERY_MAX = 200;

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * One category, browsed or narrowed. The filter rail (every attribute an item
 * page shows, with counts for this category) sits on the left; the search
 * bar, scoped to the category, above the grid. Rail selections and the query
 * ride the URL, so the server renders every state and a link reproduces it.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const valid = CATEGORIES.find((c) => c.slug === slug);
  if (!valid) notFound();
  const name = categoryName(slug);

  const sp = await searchParams;
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const query = (rawQ ?? '').slice(0, QUERY_MAX).trim();
  const filters = parseFilters(sp);
  const narrowed = Boolean(query) || countSelected(filters) > 0;

  // Loaded here, not in the sections below: async children are a server-only
  // feature, and the page test renders this tree in jsdom.
  const [facets, view] = await Promise.all([
    categoryAttributeFacets(slug),
    narrowed
      ? filterCategoryCards(slug, { query, filters }, RENDER_LIMIT).then(
          (page) => ({ kind: 'narrowed' as const, page }),
        )
      : categoryCards(slug, RENDER_LIMIT).then((page) => ({ kind: 'browse' as const, page })),
  ]);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1400px] px-3 py-8 sm:px-5 sm:py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary ink-underline hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
          Catalog
        </Link>

        <div className="mt-6">
          <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
            Category
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-foreground [font-family:var(--font-display)]">
            {name}
          </h1>
        </div>

        {/* Bar, rail, results. One column on small screens in that order; on
            large screens the rail takes the left column beside both. Rows are
            auto + 1fr: the rail spans both, and without an explicit sizing its
            height would be shared between them, pushing a short result set
            halfway down the page. */}
        <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
          <div className="max-w-[760px] lg:col-start-2 lg:row-start-1">
            <CategorySearch slug={slug} name={name} initialQuery={query} filters={filters} />
          </div>

          <div className="lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <CategoryFilters slug={slug} query={query} facets={facets} selected={filters} />
          </div>

          <div className="lg:col-start-2 lg:row-start-2">
            {view.kind === 'narrowed' ? (
              <Narrowed slug={slug} name={name} query={query} filters={filters} page={view.page} />
            ) : (
              <Browse page={view.page} />
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Browse({ page }: { page: BrowsePage }) {
  const { items, total } = page;
  return (
    <>
      <p className="font-mono text-[13px] leading-[18px] text-text-tertiary">
        {total.toLocaleString()} item{total === 1 ? '' : 's'}
        {total > items.length ? ` — showing the first ${items.length}` : ''}
      </p>
      <div className="mt-6">
        {items.length === 0 ? (
          <Empty title="Nothing here yet">No items in this category yet.</Empty>
        ) : (
          <Grid items={items} />
        )}
      </div>
    </>
  );
}

function Narrowed({
  slug,
  name,
  query,
  filters,
  page,
}: {
  slug: string;
  name: string;
  query: string;
  filters: AttributeFilters;
  page: NarrowedPage;
}) {
  const { items, capped } = page;
  const n = items.length;
  const selected = countSelected(filters);
  const scope = `in ${name}${query ? ` for “${query}”` : ''}${
    selected ? ` with ${selected} filter${selected === 1 ? '' : 's'}` : ''
  }`;
  return (
    <>
      <p className="font-mono text-[13px] leading-[18px] text-text-tertiary">
        {n === 0
          ? `No matches ${scope}`
          : capped
            ? `Showing the first ${n} matches ${scope}`
            : `${n.toLocaleString()} ${n === 1 ? 'match' : 'matches'} ${scope}`}
      </p>
      <div className="mt-6">
        {n === 0 ? (
          <Empty title="No matches in this category">
            {selected > 0 && (
              <>
                <Link href={categoryHref(slug, { q: query })} className="ink-underline text-foreground">
                  Clear the filters
                </Link>
                {query ? ', try ' : ' or try '}
              </>
            )}
            {query ? (
              <>
                {selected > 0 ? 'other words' : 'Try other words'}, or{' '}
                <Link href={`/search?q=${encodeURIComponent(query)}`} className="ink-underline text-foreground">
                  search the whole catalogue
                </Link>
                .
              </>
            ) : (
              'a different combination.'
            )}
          </Empty>
        ) : (
          <Grid items={items} />
        )}
      </div>
    </>
  );
}

function Grid({ items }: { items: CardItem[] }) {
  return (
    <SeamGrid>
      {items.map((item, i) => (
        <GridCell key={item.id} index={i}>
          <ItemCard item={item} />
        </GridCell>
      ))}
    </SeamGrid>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-y border-border py-16 text-center">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {title}
      </p>
      <p className="mt-2 text-[15px] text-text-secondary">{children}</p>
    </div>
  );
}
