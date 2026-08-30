'use client';

import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { getJson } from '@/lib/api';
import type { CardItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ItemCard } from './item-card';
import { ItemCardSkeleton } from './item-card-skeleton';

type CategoryOpt = { slug: string; name: string; count: number };
type VendorOpt = { id: string; name: string; count: number };
type BrowsePage = { items: CardItem[]; total: number };

const PAGE = 24;
const STAGGER_CAP = 12;

/**
 * Ruled contact-sheet browse (DESIGN.md section 9.3): sticky filter rail of
 * edge-to-edge rows, grid cells sharing 1px hairline seams (gap-px over a
 * border-colored track), mono running count, spring-staggered cell arrival.
 *
 * showMarquee: home page only — the first photo-mode item (or first item) spans
 * 2×2 in the ruled grid (DESIGN.md v1.1 §9.2).
 */
export function BrowseGrid({
  categories,
  vendors,
  initialItems,
  totalCatalog,
  vendorCount,
  showMarquee = false,
}: {
  categories: CategoryOpt[];
  vendors: VendorOpt[];
  initialItems: CardItem[];
  totalCatalog: number;
  vendorCount: number;
  showMarquee?: boolean;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [vendor, setVendor] = useState<string | null>(null);

  const filterActive = category !== null || vendor !== null;

  const query = useInfiniteQuery({
    queryKey: ['browse', category, vendor],
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    // Seed the unfiltered view with server-side data so the first render has
    // items immediately and the "load more" button works without a filter.
    initialData: !filterActive
      ? { pages: [{ items: initialItems, total: totalCatalog }], pageParams: [0] }
      : undefined,
    initialDataUpdatedAt: Date.now(),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (vendor) params.set('vendor', vendor);
      params.set('offset', String(pageParam));
      params.set('limit', String(PAGE));
      return getJson<BrowsePage>(`/api/browse?${params.toString()}`);
    },
    getNextPageParam: (_last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      const total = pages[0]?.total ?? 0;
      return loaded < total ? loaded : undefined;
    },
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? initialItems;
  const total = query.data?.pages[0]?.total ?? totalCatalog;
  const loading = query.isFetching && !query.isFetchingNextPage && items.length === 0;

  const toggleCategory = (slug: string) => setCategory((c) => (c === slug ? null : slug));
  const toggleVendor = (id: string) => setVendor((v) => (v === id ? null : id));
  const clearAll = () => {
    setCategory(null);
    setVendor(null);
  };

  const activeCategoryName = category
    ? (categories.find((c) => c.slug === category)?.name ?? category)
    : null;
  const activeVendorName = vendor
    ? (vendors.find((v) => v.id === vendor)?.name ?? vendor)
    : null;

  const countLine = filterActive
    ? [`${total.toLocaleString()} ${total === 1 ? 'item' : 'items'}`, activeCategoryName, activeVendorName]
        .filter(Boolean)
        .join(', ')
    : `${total.toLocaleString()} pieces across ${vendorCount} houses`;

  // Marquee item: first photo-mode item on home page only; not shown when filtering.
  const photoIdx = showMarquee && !filterActive ? items.findIndex((i) => i.plateMode === 'photo') : -1;
  const marqueeIndex = showMarquee && !filterActive ? (photoIdx >= 0 ? photoIdx : 0) : -1;

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 pb-24 sm:px-6">
      <div className="flex gap-8 pt-12">
        <aside className="hidden w-[264px] shrink-0 md:block">
          <div className="sticky top-20 space-y-8">
            <FilterGroup label="City">
              <FilterRow name="Los Angeles, CA" selected onClick={() => {}} />
            </FilterGroup>
            <FilterGroup label="Category">
              <FilterRow name="All categories" selected={category === null} onClick={() => setCategory(null)} />
              {categories.map((c) => (
                <FilterRow
                  key={c.slug}
                  name={c.name}
                  count={c.count}
                  selected={category === c.slug}
                  onClick={() => toggleCategory(c.slug)}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Vendor">
              <FilterRow name="All vendors" selected={vendor === null} onClick={() => setVendor(null)} />
              {vendors.map((v) => (
                <FilterRow
                  key={v.id}
                  name={v.name}
                  count={v.count}
                  selected={vendor === v.id}
                  onClick={() => toggleVendor(v.id)}
                />
              ))}
            </FilterGroup>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[13px] leading-[18px] text-text-tertiary">{countLine}</p>
            {filterActive && (
              <button
                onClick={clearAll}
                className="h-8 rounded-sm border border-border px-3 text-[13px] text-text-secondary transition-colors duration-150 hover:bg-popover hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Mobile filter chips */}
          <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 md:hidden">
            {categories.map((c) => (
              <button
                key={c.slug}
                onClick={() => toggleCategory(c.slug)}
                className={cn(
                  'h-8 shrink-0 whitespace-nowrap rounded-sm border px-3 font-mono text-[12px] transition-colors duration-150',
                  category === c.slug
                    ? 'border-accent text-accent-text'
                    : 'border-border text-text-secondary',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {loading ? (
            <SeamGrid>
              {Array.from({ length: PAGE }, (_, i) => (
                <ItemCardSkeleton key={i} />
              ))}
            </SeamGrid>
          ) : items.length === 0 ? (
            <div className="border-y border-border py-16 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                No matches
              </p>
              <p className="mt-2 text-[15px] text-text-secondary">
                No pieces match these filters.
              </p>
              <button
                onClick={clearAll}
                className="mt-5 h-9 rounded-sm border border-border px-4 text-sm text-text-secondary transition-colors duration-150 hover:bg-popover hover:text-foreground"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <SeamGrid>
                {items.map((item, i) => (
                  <GridCell key={item.id} index={i} marquee={i === marqueeIndex}>
                    <ItemCard item={item} marquee={i === marqueeIndex} />
                  </GridCell>
                ))}
              </SeamGrid>
              {query.hasNextPage && (
                <div className="mt-10 flex justify-center">
                  <button
                    onClick={() => query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                    className="h-10 rounded-sm border border-border px-5 text-sm text-text-secondary transition-colors duration-150 hover:bg-popover hover:text-foreground disabled:opacity-60"
                  >
                    {query.isFetchingNextPage ? 'Loading' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** 1px seams: cells sit on a border-colored track with a pixel gap. */
function SeamGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-3 xl:grid-cols-4 min-[1680px]:grid-cols-5">
      {children}
    </div>
  );
}

/** grid-arrive (DESIGN.md section 8): light comes up, cells never fly in. */
function GridCell({
  index,
  children,
  marquee,
}: {
  index: number;
  children: React.ReactNode;
  marquee?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 380,
        damping: 34,
        delay: Math.min(index % PAGE, STAGGER_CAP) * 0.04,
      }}
      className={cn('bg-background', marquee && 'col-span-2 row-span-2')}
    >
      {children}
    </motion.div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-3 font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function FilterRow({
  name,
  count,
  selected,
  onClick,
}: {
  name: string;
  count?: number;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 border-l-2 px-3 text-left transition-colors duration-150',
        selected
          ? 'border-accent bg-popover text-foreground'
          : 'border-transparent text-text-secondary hover:bg-popover hover:text-foreground',
      )}
    >
      <span className="truncate text-sm">{name}</span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-xs text-text-tertiary">{count.toLocaleString()}</span>
      )}
    </button>
  );
}
