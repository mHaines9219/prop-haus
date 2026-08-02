-- ============================================================================
-- Prop Haus — expose the catalog to the Data API via a view in `public`
--
-- The catalog has been loaded into Postgres since 6292167 (89,051 rows, 890 MB,
-- fully indexed) and the app has never read a single row of it. Not a
-- permissions problem — a transport one. PostgREST serves only `public` and
-- `graphql_public` on this project, so `catalog.prop_items` has no route in:
--
--   GET /rest/v1/prop_items  (service role, Accept-Profile: catalog)
--   -> 406 PGRST106 "Only the following schemas are exposed: public, graphql_public"
--
-- Even the service role is refused. 20260627190000 anticipated this exactly --
-- it granted `select` to anon/authenticated and added an RLS policy "for
-- future Data API exposure" -- but the exposure step itself was never taken.
-- This is that step.
--
-- A view in `public` rather than exposing the whole `catalog` schema:
--
--   * It is a migration, so the API surface is in the repo and reviewable
--     rather than a dashboard setting nobody can diff.
--   * It withholds `embedding` and `search_tsv`. Those are 354 MB and 19 MB of
--     index respectively, are never rendered, and would otherwise ride along
--     on `select=*`. #9 deliberately trimmed list payloads to a card
--     projection; re-widening them at the API would undo that. Callers narrow
--     further per-request with PostgREST `?select=`, so the card projection
--     stays a query concern rather than needing its own view.
--   * `prop_items_staging` stays unreachable either way -- it has no anon grant
--     and no RLS policy, and is deliberately not viewed here. A half-loaded
--     scrape must never be servable.
--
-- security_invoker = true: the view runs as the caller, so the existing
-- "catalog is publicly readable" RLS policy on catalog.prop_items still
-- applies. Without it the view would run as owner and silently bypass RLS,
-- which is the classic way a view becomes a privilege-escalation hole.
-- ============================================================================

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
  price_unit
from catalog.prop_items;

comment on view public.catalog_items is
  'Data API surface for catalog.prop_items. Excludes embedding and search_tsv (never rendered, and large). security_invoker so the underlying RLS policy governs access. Narrow per request with PostgREST ?select= — the card projection is id,source,source_id,name,subcategory,images.';

grant select on public.catalog_items to anon, authenticated, service_role;
