-- ============================================================================
-- Prop Haus — make the browse surfaces servable from Postgres
--
-- #23 exposed catalog.prop_items through public.catalog_items, but three things
-- the home page and browse route actually do could not be expressed against it.
-- Measured through the Data API as anon before writing any of this:
--
--   1. The has-images predicate times out.
--
--        images=neq.%7B%7D      500  57014 statement timeout
--        images=not.eq.%7B%7D   500  57014 statement timeout
--        images=cs.%7B%7D       206  0-0/90953   <- matches everything; useless
--
--      Every list surface filters `images.length > 0` (app/api/browse/route.ts,
--      app/page.tsx), because a card with no image is not renderable. Array
--      inequality against an unindexed 90k-row column is a sequential scan over
--      890 MB. So the predicate has to become something indexable.
--
--   2. GROUP BY is not expressible. The home page needs per-category and
--      per-vendor counts. PostgREST has no aggregate surface, so this needs an
--      RPC or the app pulls 90,816 rows to count them client-side, which is the
--      thing we are removing.
--
--   3. A filtered page cost 720 ms (category + vendor + count=exact), which is
--      the count over the filtered set rather than the page itself.
--
-- Fixes, in order:
--   * has_images as a plain boolean column on the view, so the filter becomes
--     has_images=is.true -- a boolean PostgREST handles natively.
--   * A matching expression index on the base table, plus composite indexes on
--     (category) and (source) restricted to rows with images, since every list
--     query carries that predicate.
--   * catalog_facets() for the two GROUP BYs in one round trip.
--
-- The view is recreated rather than altered because adding a column to a view
-- requires it. Column list is otherwise unchanged from #23 -- embedding and
-- search_tsv stay withheld, security_invoker stays on so the RLS policy governs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Indexes first, so the view is fast the moment anything queries it.
--
-- The expression must match the view's has_images expression exactly or the
-- planner will not use the index. coalesce(array_length(images,1),0) > 0 rather
-- than images <> '{}' because array_length returns null for an empty array, and
-- a null predicate is not indexable as a boolean.
-- ---------------------------------------------------------------------------
create index if not exists prop_items_has_images_idx
  on catalog.prop_items ((coalesce(array_length(images, 1), 0) > 0));

-- Partial indexes: every list query is "rows with images, filtered by category
-- or vendor". Restricting the index to that subset makes it smaller than the
-- plain single-column indexes already present and lets one index serve the
-- whole predicate.
create index if not exists prop_items_cat_with_images_idx
  on catalog.prop_items (category)
  where coalesce(array_length(images, 1), 0) > 0;

create index if not exists prop_items_source_with_images_idx
  on catalog.prop_items (source)
  where coalesce(array_length(images, 1), 0) > 0;

-- ---------------------------------------------------------------------------
-- The view, with has_images added.
-- ---------------------------------------------------------------------------
drop view if exists public.catalog_items;

create view public.catalog_items
with (security_invoker = true)
as
select
  id,
  source,
  source_id,
  name,
  description,
  category,
  subcategory,
  source_category_path,
  style,
  era,
  materials,
  colors,
  vibes,
  setting_type,
  genre_fit,
  tags,
  dimensions,
  vendor,
  images,
  source_url,
  scraped_at,
  price_amount,
  price_currency,
  price_unit,
  -- Kept byte-identical to prop_items_has_images_idx above.
  (coalesce(array_length(images, 1), 0) > 0) as has_images
from catalog.prop_items;

comment on view public.catalog_items is
  'Data API surface for catalog.prop_items. Excludes embedding and search_tsv (never rendered, and large). has_images is indexed — filter lists with has_images=is.true rather than an array comparison, which sequential-scans. security_invoker so the underlying RLS policy governs access. Narrow per request with ?select=; the card projection is id,source,source_id,name,subcategory,images.';

grant select on public.catalog_items to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Facets for the home page: category and vendor counts in one round trip.
--
-- Restricted to rows with images, matching what the lists actually show — a
-- count that includes unrenderable items would disagree with the grid beneath
-- it, which is worse than no count.
--
-- Returned as two jsonb objects rather than a row set so one call answers both
-- and the client indexes straight into them.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_facets()
returns table (categories jsonb, vendors jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select category, source
    from catalog.prop_items
    where coalesce(array_length(images, 1), 0) > 0
  )
  select
    (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb)
       from (select category, count(*) as n from visible group by category) c),
    (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
       from (select source, count(*) as n from visible group by source) v)
$$;

comment on function public.catalog_facets() is
  'Per-category and per-vendor counts over catalog items that have at least one image, as two jsonb maps. Powers the home page facets without shipping 90k rows to count them.';

grant execute on function public.catalog_facets() to anon, authenticated, service_role;
