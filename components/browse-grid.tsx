'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { List, ListItem } from '@astryxdesign/core/List';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { Text } from '@astryxdesign/core/Text';
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
      <aside className="hidden w-56 shrink-0 space-y-8 md:block">
        <FilterSection label="City">
          <List density="compact">
            <ListItem label="Los Angeles, CA" isSelected />
          </List>
        </FilterSection>

        <FilterSection label="Category">
          <List density="compact">
            <ListItem
              label="All categories"
              isSelected={category === null}
              onClick={() => setCategory(null)}
            />
            {categories.map((c) => (
              <ListItem
                key={c.slug}
                label={c.name}
                isSelected={category === c.slug}
                onClick={() => toggleCategory(c.slug)}
                endContent={<Badge label={String(c.count)} />}
              />
            ))}
          </List>
        </FilterSection>

        <FilterSection label="Vendor">
          <List density="compact">
            <ListItem
              label="All vendors"
              isSelected={vendor === null}
              onClick={() => setVendor(null)}
            />
            {vendors.map((v) => (
              <ListItem
                key={v.id}
                label={v.name}
                isSelected={vendor === v.id}
                onClick={() => toggleVendor(v.id)}
                endContent={<Badge label={String(v.count)} />}
              />
            ))}
          </List>
        </FilterSection>
      </aside>

      {/* Grid */}
      <div className="flex-1">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Text type="supporting" color="secondary">
            {filterActive
              ? `${total.toLocaleString()} ${total === 1 ? 'item' : 'items'}${
                  activeCategoryName ? ` · ${activeCategoryName}` : ''
                }${activeVendorName ? ` · ${activeVendorName}` : ''}`
              : `Featured — ${totalCatalog.toLocaleString()} items across ${vendorCount} vendors`}
          </Text>
          {filterActive && (
            <Button label="Clear filters" variant="ghost" size="sm" onClick={clearAll} />
          )}
        </div>

        {/* Mobile filter chips (sidebar is hidden on small screens) */}
        <div className="mb-6 flex flex-wrap gap-2 md:hidden">
          {categories.map((c) => (
            <Token
              key={c.slug}
              label={c.name}
              onClick={() => toggleCategory(c.slug)}
              color={category === c.slug ? 'blue' : undefined}
            />
          ))}
        </div>

        {loading && items.length === 0 ? (
          <Text color="secondary">Loading…</Text>
        ) : items.length === 0 ? (
          <Text color="secondary">No items match these filters.</Text>
        ) : (
          <>
            <Grid columns={{ minWidth: 220 }} gap={5}>
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </Grid>
            {hasMore && (
              <div className="mt-10 flex justify-center">
                <Button
                  label={query.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  variant="secondary"
                  onClick={loadMore}
                  isLoading={query.isFetchingNextPage}
                  isDisabled={query.isFetchingNextPage}
                />
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
      <div className="mb-2">
        <Text type="label" color="secondary">
          {label}
        </Text>
      </div>
      {children}
    </div>
  );
}
