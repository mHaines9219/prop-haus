-- ============================================================================
-- Prop Haus — precompute the catalog facet counts
--
-- 20260802030000 added catalog_facets() as a live GROUP BY. Measured, it times
-- out: aggregating 90k rows behind the has-images predicate takes longer than
-- the statement timeout allows.
--
--   catalog_facets()                       500  57014 statement timeout  3.2s
--
-- The same measurement pass showed the unfiltered total is the other casualty of
-- that ceiling, and that the obvious escape does not work:
--
--   count=exact      206  0-23/90953   1421ms   correct, but near the timeout
--   count=planned    206  0-23/30318    237ms   wrong by 3x
--   count=estimated  206  0-23/30318     66ms   wrong by 3x
--
-- So a planner estimate cannot back a UI count, and an exact count over the
-- whole catalog is too slow to put on a page load.
--
-- Both are the same problem: a number derived from the entire catalog, computed
-- per request, for data that only changes when the catalog is reloaded. So
-- compute it once at load time instead.
--
-- Filtered counts are NOT affected and stay live — they were already fast on the
-- partial indexes from the previous migration:
--
--   category=eq.seating                206  0-23/4756   488ms
--   category=eq.seating&source=eq.omega 206  0-23/75      73ms
--   source=eq.gilandroy&offset=48      206  48-71/18795   91ms
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One row per (kind, key). Restricted to items with at least one image, so the
-- counts agree with the grids they label — a facet count that includes
-- unrenderable items is worse than no count.
-- ---------------------------------------------------------------------------
create materialized view catalog.facet_counts as
with visible as (
  select category, source
  from catalog.prop_items
  where coalesce(array_length(images, 1), 0) > 0
)
select 'category'::text as kind, category as key, count(*)::bigint as n
  from visible group by category
union all
select 'vendor'::text, source, count(*)::bigint
  from visible group by source;

-- Unique index so the view can be refreshed CONCURRENTLY, which matters because
-- a plain REFRESH takes an ACCESS EXCLUSIVE lock and would block reads mid-load.
create unique index facet_counts_kind_key_idx on catalog.facet_counts (kind, key);

comment on materialized view catalog.facet_counts is
  'Per-category and per-vendor counts over items with images. Refreshed by catalog.refresh_facets(), which swap_in_staging() calls after a catalog load. Exists because the live GROUP BY exceeded the statement timeout.';

-- ---------------------------------------------------------------------------
-- Refresh hook. Called from swap_in_staging so a catalog reload cannot leave
-- the facets describing the previous snapshot.
-- ---------------------------------------------------------------------------
create or replace function catalog.refresh_facets()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- CONCURRENTLY needs a pre-existing populated view; on the first call after a
  -- create it is already populated, so this is safe. Falls back to a plain
  -- refresh if the concurrent path is unavailable for any reason.
  begin
    refresh materialized view concurrently catalog.facet_counts;
  exception when others then
    refresh materialized view catalog.facet_counts;
  end;
end;
$$;

comment on function catalog.refresh_facets() is
  'Recomputes catalog.facet_counts. Concurrent refresh so catalog reads are not blocked; falls back to a locking refresh if unavailable.';

grant execute on function catalog.refresh_facets() to catalog_writer, service_role;

-- ---------------------------------------------------------------------------
-- Fold the refresh into the existing atomic swap. Body is unchanged from
-- 20260627190000 except for the final refresh call -- restated in full because
-- CREATE OR REPLACE FUNCTION has no partial form.
-- ---------------------------------------------------------------------------
create or replace function catalog.swap_in_staging()
returns bigint
language plpgsql
set search_path = catalog, extensions, pg_temp
as $$
declare
  n bigint;
begin
  truncate catalog.prop_items;
  insert into catalog.prop_items (
    id, source, source_id, name, description, category, subcategory,
    source_category_path, style, era, materials, colors, vibes, setting_type,
    genre_fit, tags, dimensions, vendor, images, source_url, scraped_at, embedding,
    price_amount, price_currency, price_unit
  )
  select
    id, source, source_id, name, description, category, subcategory,
    source_category_path, style, era, materials, colors, vibes, setting_type,
    genre_fit, tags, dimensions, vendor, images, source_url, scraped_at, embedding,
    price_amount, price_currency, price_unit
  from catalog.prop_items_staging;
  get diagnostics n = row_count;
  truncate catalog.prop_items_staging;
  -- Facets describe prop_items, so they are stale the instant it changes.
  perform catalog.refresh_facets();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Replace the timing-out live aggregate with a read of the precomputed view.
--
-- Dropped rather than replaced: this adds a `total` output column, and
-- CREATE OR REPLACE cannot change the return type of an existing function
-- (SQLSTATE 42P13). The previous version has no callers -- it never worked.
-- ---------------------------------------------------------------------------
drop function if exists public.catalog_facets();

create or replace function public.catalog_facets()
returns table (categories jsonb, vendors jsonb, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
       from catalog.facet_counts where kind = 'category'),
    (select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
       from catalog.facet_counts where kind = 'vendor'),
    (select coalesce(sum(n), 0)::bigint
       from catalog.facet_counts where kind = 'category')
$$;

comment on function public.catalog_facets() is
  'Category and vendor counts as jsonb maps, plus the total number of items with images. Reads the precomputed catalog.facet_counts; the live GROUP BY it replaced exceeded the statement timeout. total is the number to use for an unfiltered browse count — a PostgREST estimated count reports ~30k against a true ~91k.';

-- facet_counts is aggregate reference data over an already-public catalog, so
-- reading it is no more revealing than the counts themselves.
grant usage on schema catalog to anon, authenticated;
grant select on catalog.facet_counts to anon, authenticated, service_role;
grant execute on function public.catalog_facets() to anon, authenticated, service_role;
