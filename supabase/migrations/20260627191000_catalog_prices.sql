-- ============================================================================
-- Prop Haus — add rental price to the catalog.
--
-- Price is published by only a subset of vendors (e.g. WooCommerce rental
-- shops like Prop Services West); quote-only houses leave it NULL, which the
-- app reads as "request a quote". Nullable adds = instant at 100k rows, no
-- rewrite. Feeds future budget-aware AI search.
-- ============================================================================

alter table catalog.prop_items
  add column price_amount   numeric,
  add column price_currency text,
  add column price_unit     text;  -- 'day' | 'week' | 'month' | 'event' | 'purchase' | null

alter table catalog.prop_items_staging
  add column price_amount   numeric,
  add column price_currency text,
  add column price_unit     text;

comment on column catalog.prop_items.price_amount is
  'Published rental price as scraped. NULL = vendor is quote-only (request a quote).';
comment on column catalog.prop_items.price_unit is
  'Rental period when the site states it (day/week/month/event) or ''purchase''. Often NULL — period unspecified.';

-- Keep the atomic swap in sync with the new columns.
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
  return n;
end;
$$;
