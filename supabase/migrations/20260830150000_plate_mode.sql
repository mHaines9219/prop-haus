-- ============================================================================
-- Prop Haus — add plate_mode to the catalog
--
-- The light-well image treatment (DESIGN.md §4) has two modes:
--   cutout — white/near-white background, rendered via multiply blend on the
--            plate. Default for scraped studio shots.
--   photo  — lifestyle or location shot, rendered full-bleed with object-cover.
--
-- This flag is computed at ingest by the four-corner luminance heuristic:
-- mean corner luminance >= 0.88 -> cutout, else -> photo.
-- NULL means "not yet computed" and the UI falls back to 'cutout'.
--
-- Anti-pattern #14 in DESIGN.md forbids guessing client-side.
-- ============================================================================

alter table catalog.prop_items
  add column if not exists plate_mode text
  constraint plate_mode_values check (plate_mode in ('cutout', 'photo'));

alter table catalog.prop_items_staging
  add column if not exists plate_mode text
  constraint plate_mode_values check (plate_mode in ('cutout', 'photo'));

-- Update the atomic swap function to carry plate_mode across.
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
    plate_mode
  )
  select
    id, source, source_id, name, description, category, subcategory,
    source_category_path, style, era, materials, colors, vibes, setting_type,
    genre_fit, tags, dimensions, vendor, images, source_url, scraped_at, embedding,
    plate_mode
  from catalog.prop_items_staging;
  get diagnostics n = row_count;
  truncate catalog.prop_items_staging;
  return n;
end;
$$;

-- Recreate the public view to include plate_mode.
-- Drop and recreate rather than ALTER VIEW — Postgres requires a full
-- recreate to add columns to a view.
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
  plate_mode,
  (coalesce(array_length(images, 1), 0) > 0) as has_images
from catalog.prop_items;

comment on view public.catalog_items is
  'Data API surface for catalog.prop_items. Excludes embedding and search_tsv. plate_mode: cutout (white-bg, multiply blend on plate) vs photo (lifestyle/full-bleed cover). NULL falls back to cutout — never guessed client-side (DESIGN.md §4 anti-pattern #14). has_images is indexed — filter with has_images=is.true. security_invoker so the underlying RLS policy governs access. Narrow per request with ?select=; card projection: id,source,source_id,name,subcategory,images,category,source_url,plate_mode,dimensions,price_amount,price_currency,price_unit.';

grant select on public.catalog_items to anon, authenticated, service_role;
