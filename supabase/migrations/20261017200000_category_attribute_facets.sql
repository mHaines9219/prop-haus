-- ============================================================================
-- Prop Haus — per-category attribute facets for the category page's filter rail
--
-- The category page lets a user narrow a category by the enrichment attributes
-- an item page shows (era, style, vibes, materials, colors, setting, genre fit,
-- tags). The rail needs, per category, every value of every attribute and how
-- many items carry it.
--
-- Computed live that is a GROUP BY over eight unnested arrays of up to 11k rows
-- per category. Same family of problem as 20260802031000: a number derived
-- from a large slice of the catalog, for data that only changes on a catalog
-- load. So it is precomputed the same way, into a materialized view refreshed
-- by catalog.refresh_facets(), which swap_in_staging() already calls.
--
-- Filtering itself stays live: `category = X and style && '{industrial}'` over
-- the (category, id) partial index answered in ~90–300ms in every category
-- measured (Oct 17 2026), so no new index is needed for the reads.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One row per (category, attribute, value). Restricted to items with at least
-- one image, so a count agrees with the grid it narrows.
-- ---------------------------------------------------------------------------
create materialized view catalog.attribute_counts as
with visible as (
  select category, era, style, vibes, materials, colors, setting_type, genre_fit, tags
  from catalog.prop_items
  where coalesce(array_length(images, 1), 0) > 0
),
exploded as (
  select category, 'era'::text as attribute, era as value from visible
  union all select category, 'style',        unnest(style)        from visible
  union all select category, 'vibes',        unnest(vibes)        from visible
  union all select category, 'materials',    unnest(materials)    from visible
  union all select category, 'colors',       unnest(colors)       from visible
  union all select category, 'setting_type', unnest(setting_type) from visible
  union all select category, 'genre_fit',    unnest(genre_fit)    from visible
  union all select category, 'tags',         unnest(tags)         from visible
)
select category, attribute, value, count(*)::bigint as n
from exploded
where value is not null and value <> ''
group by category, attribute, value;

-- Unique index so the view can be refreshed CONCURRENTLY (see refresh_facets).
create unique index attribute_counts_pk
  on catalog.attribute_counts (category, attribute, value);

comment on materialized view catalog.attribute_counts is
  'Per-category counts of every enrichment attribute value (era, style, vibes, materials, colors, setting_type, genre_fit, tags) over items with images. Feeds the category page filter rail through public.category_attribute_facets(). Refreshed by catalog.refresh_facets().';

-- ---------------------------------------------------------------------------
-- refresh_facets now refreshes both views. Same concurrent-with-fallback shape
-- as 20260802031000, applied to each view independently so a failure on one
-- does not leave the other stale.
-- ---------------------------------------------------------------------------
create or replace function catalog.refresh_facets()
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    refresh materialized view concurrently catalog.facet_counts;
  exception when others then
    refresh materialized view catalog.facet_counts;
  end;
  begin
    refresh materialized view concurrently catalog.attribute_counts;
  exception when others then
    refresh materialized view catalog.attribute_counts;
  end;
end;
$$;

comment on function catalog.refresh_facets() is
  'Recomputes catalog.facet_counts and catalog.attribute_counts. Concurrent refresh so catalog reads are not blocked; falls back to a locking refresh if unavailable.';

-- ---------------------------------------------------------------------------
-- The read. One jsonb object keyed by attribute column, each a list of
-- {value, n} ordered by count, cut to the top p_limit per attribute: tags are
-- a long tail (12k distinct in artwork-wall) and the rail shows the head.
-- ---------------------------------------------------------------------------
create or replace function public.category_attribute_facets(p_category text, p_limit int default 40)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(attribute, vals), '{}'::jsonb)
  from (
    select attribute,
           jsonb_agg(jsonb_build_object('value', value, 'n', n) order by n desc, value) as vals
    from (
      select attribute, value, n,
             row_number() over (partition by attribute order by n desc, value) as rk
      from catalog.attribute_counts
      where category = p_category
    ) ranked
    where rk <= greatest(1, least(coalesce(p_limit, 40), 200))
    group by attribute
  ) grouped
$$;

comment on function public.category_attribute_facets(text, int) is
  'Attribute values and counts for one category, as {column: [{value, n}, ...]} ordered by count, top p_limit per attribute. Reads catalog.attribute_counts. lib/catalog-db.ts categoryAttributeFacets() is the caller.';

-- Aggregate reference data over an already-public catalog, like facet_counts.
grant select on catalog.attribute_counts to anon, authenticated, service_role;
grant execute on function public.category_attribute_facets(text, int) to anon, authenticated, service_role;
