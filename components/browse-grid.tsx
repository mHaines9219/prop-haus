'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ItemCard } from '@/components/item-card';
import { getJson } from '@/lib/api';
import type { PropItem } from '@/lib/types';

type CategoryOpt = { slug: string; name: string; count: number };
type VendorOpt = { id: string; name: string; count: number };
type BrowsePage = { items: PropItem[]; total: number };

const PAGE = 24;

export function BrowseGrid({
  categories,
  vendors,
  initialItems,
  totalCatalog,
  vendorCount,
}: {
  categories: CategoryOpt[];
  vendors: VendorOpt[];
  initialItems: PropItem[];
  totalCatalog: number;
  vendorCount: number;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [vendor, setVendor] = useState<string | null>(null);

  const filterActive = category !== null || vendor !== null;

  // TanStack handles the offset paging, stale-request races (by query key), and
  // loading flags that this component used to track by hand. Disabled entirely
  // when no filter is active — we show the server-rendered featured set then.
  const query = useInfiniteQuery({
    queryKey: ['browse', category, vendor],
    enabled: filterActive,
    initialPageParam: 0,
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

  const items = filterActive
    ? (query.data?.pages.flatMap((p) => p.items) ?? [])
    : initialItems;
  const total = filterActive
    ? (query.data?.pages[0]?.total ?? 0)
    : initialItems.length;
  const loading = filterActive && query.isFetching && !query.isFetchingNextPage;
  const hasMore = filterActive && query.hasNextPage;
  const loadMore = () => query.fetchNextPage();

  const toggleCategory = (slug: string) =>
    setCategory((c) => (c === slug ? null : slug));
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

  return (
    <div className="flex gap-10 pt-10">
      <aside className="hidden w-52 shrink-0 space-y-8 md:block">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">
            City
          </p>
          <div className="border border-ink/15 bg-card px-3 py-2 text-sm">Los Angeles, CA</div>
        </div>

        <FilterSection label="Category">
          <FilterButton
            label="All categories"
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {categories.map((c) => (
            <FilterButton
              key={c.slug}
              label={c.name}
              count={c.count}
              active={category === c.slug}
              onClick={() => toggleCategory(c.slug)}
            />
          ))}
        </FilterSection>

        <FilterSection label="Vendor">
          <FilterButton
            label="All vendors"
            active={vendor === null}
            onClick={() => setVendor(null)}
          />
          {vendors.map((v) => (
            <FilterButton
              key={v.id}
              label={v.name}
              count={v.count}
              active={vendor === v.id}
              onClick={() => toggleVendor(v.id)}
            />
          ))}
        </FilterSection>
      </aside>

      {/* Grid */}
      <div className="flex-1">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs text-muted-foreground">
            {filterActive ? (
              <>
                {total.toLocaleString()} {total === 1 ? 'item' : 'items'}
                {activeCategoryName ? ` · ${activeCategoryName}` : ''}
                {activeVendorName ? ` · ${activeVendorName}` : ''}
              </>
            ) : (
              <>
                Featured — {totalCatalog.toLocaleString()} items across {vendorCount} vendors
              </>
            )}
          </p>
          {filterActive && (
            <button
              type="button"
              onClick={clearAll}
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground underline-offset-4 transition hover:text-ink hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Mobile filter chips (sidebar is hidden on small screens) */}
        <div className="mb-6 flex flex-wrap gap-2 md:hidden">
          {categories.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              active={category === c.slug}
              onClick={() => toggleCategory(c.slug)}
            />
          ))}
        </div>

        {loading && items.length === 0 ? (
          <p className="font-sans text-ink/60">Loading…</p>
        ) : items.length === 0 ? (
          <p className="font-sans text-ink/60">No items match these filters.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={query.isFetchingNextPage}
                  className="border border-ink/20 px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] text-ink transition hover:bg-ink hover:text-paper disabled:opacity-50"
                >
                  {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-3">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[13px] transition ${
        active ? 'bg-ink text-paper' : 'text-ink/75 hover:bg-muted hover:text-ink'
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span
          className={`ml-2 shrink-0 font-mono text-[10px] ${
            active ? 'text-paper/60' : 'text-muted-foreground'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-ink/20 text-ink/70 hover:border-ink/50'
      }`}
    >
      {label}
    </button>
  );
}
