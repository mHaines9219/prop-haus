-- Keyword search over the catalog, served from Postgres.
--
-- Why not the existing search_tsv
-- -------------------------------
-- catalog.prop_items.search_tsv covers name, description, tags, style, category
-- and subcategory. lib/keyword-search.ts searches twelve fields — those six plus
-- colors, materials, era, setting_type and genre_fit — and six of the
-- missing ones are exactly the "matched via" chips the result cards render
-- (components/item-card.tsx:43). Serving keyword search off search_tsv would
-- silently drop half the searchable surface.
--
-- Rather than widen the stored column (which means a trigger change plus an
-- UPDATE over 90k rows on an 890 MB table), this adds an expression index over
-- the full field set. Postgres builds it once; nothing else changes, and the
-- existing search_tsv column and its trigger are untouched.
--
-- Semantics preserved from lib/keyword-search.ts
-- ---------------------------------------------
--   * AND across tokens — "blue couch" returns blue couches, not everything blue.
--   * Trailing prefix match — the filter box fires per keystroke, so a half-typed
--     "couc" must still match "couch". websearch_to_tsquery has no prefix syntax,
--     so the query is built explicitly with :* on the final token.
--   * Field weights, so name beats description. Mapped onto Postgres A-D:
--       A = name                      (weight 6)
--       B = subcategory, category     (weight 5, 4)
--       C = tags, style, colors, materials, era   (weight 4)
--       D = vibes, setting_type, genre_fit, description (weight 3, 2, 1)
--   * matched_via — the chip fields that actually matched, returned per row so the
--     card keeps rendering them without shipping the whole item to the client.
--
-- Deliberately NOT preserved: mid-word substring matching ("ouc" matching
-- "couch"). Postgres text search is token-based. Leading-substring matches are
-- covered by the :* prefix above; interior ones are not, and are not worth a
-- trigram index over twelve fields on 90k rows.

-- ---------------------------------------------------------------------------
-- The searchable document. Must be kept byte-identical to the expression in the
-- index below, or the planner will not use it.
-- ---------------------------------------------------------------------------
create or replace function catalog.prop_item_document(p catalog.prop_items)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    setweight(to_tsvector('english', coalesce(p.name, '')), 'A') ||
    setweight(to_tsvector('english',
      coalesce(p.subcategory, '') || ' ' || coalesce(p.category, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(array_to_string(p.tags, ' '), '') || ' ' ||
      coalesce(array_to_string(p.style, ' '), '') || ' ' ||
      coalesce(array_to_string(p.colors, ' '), '') || ' ' ||
      coalesce(array_to_string(p.materials, ' '), '') || ' ' ||
      coalesce(p.era, '')), 'C') ||
    setweight(to_tsvector('english',
      coalesce(array_to_string(p.vibes, ' '), '') || ' ' ||
      coalesce(array_to_string(p.setting_type, ' '), '') || ' ' ||
      coalesce(array_to_string(p.genre_fit, ' '), '') || ' ' ||
      coalesce(p.description, '')), 'D')
$$;

comment on function catalog.prop_item_document(catalog.prop_items) is
  'Weighted tsvector over every field lib/keyword-search.ts searches. Backs prop_items_keyword_idx; the index expression must match this call exactly.';

create index if not exists prop_items_keyword_idx
  on catalog.prop_items using gin (catalog.prop_item_document(prop_items));

-- ---------------------------------------------------------------------------
-- Build an AND-ed tsquery with a prefix match on the trailing token.
-- to_tsquery() throws on unparseable input, so tokens are stripped to word
-- characters first — user input reaches this straight from a query string.
-- ---------------------------------------------------------------------------
create or replace function catalog.keyword_tsquery(q text)
returns tsquery
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  tokens text[];
  parts  text[] := '{}';
  i      int;
begin
  tokens := array_remove(
    regexp_split_to_array(lower(regexp_replace(coalesce(q, ''), '[^\w\s]+', ' ', 'g')), '\s+'),
    ''
  );
  if tokens is null or cardinality(tokens) = 0 then
    return null;
  end if;
  for i in 1 .. cardinality(tokens) loop
    -- Only the last token gets :* — the earlier ones are complete words the user
    -- has finished typing, and prefixing them would over-match badly.
    parts := parts || (quote_literal(tokens[i]) || case when i = cardinality(tokens) then ':*' else '' end);
  end loop;
  return to_tsquery('english', array_to_string(parts, ' & '));
end;
$$;

-- ---------------------------------------------------------------------------
-- The API surface. security invoker so the existing RLS policy on
-- catalog.prop_items governs it, exactly like public.catalog_items.
-- ---------------------------------------------------------------------------
create or replace function public.search_catalog_keyword(q text, max_results int default 60)
returns table (
  id           text,
  source       text,
  source_id    text,
  name         text,
  subcategory  text,
  images       text[],
  matched_via  text[],
  score        real,
  total        bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    select catalog.keyword_tsquery(q) as tq
  ),
  hits as (
    select
      p.*,
      ts_rank(catalog.prop_item_document(p), (select tq from query)) as rank,
      count(*) over () as total
    from catalog.prop_items p
    where (select tq from query) is not null
      and catalog.prop_item_document(p) @@ (select tq from query)
    order by rank desc, p.id
    limit least(greatest(coalesce(max_results, 60), 1), 200)
  )
  select
    h.id,
    h.source,
    h.source_id,
    h.name,
    h.subcategory,
    h.images,
    -- Chip fields only, in the weight order lib/keyword-search.ts uses, capped at
    -- four the same way. Computed after LIMIT so it costs nothing on the misses.
    (
      select array_agg(v order by ord)
      from (
        select 1 as ord, h.subcategory as v
        where h.subcategory is not null
          and to_tsvector('english', h.subcategory) @@ (select tq from query)
        union all
        select 2, h.category
        where h.category is not null
          and to_tsvector('english', h.category) @@ (select tq from query)
        union all
        select 3, t from unnest(coalesce(h.tags, '{}')) t
        where to_tsvector('english', t) @@ (select tq from query)
        union all
        select 4, s from unnest(coalesce(h.style, '{}')) s
        where to_tsvector('english', s) @@ (select tq from query)
        union all
        select 5, c from unnest(coalesce(h.colors, '{}')) c
        where to_tsvector('english', c) @@ (select tq from query)
        union all
        select 6, m from unnest(coalesce(h.materials, '{}')) m
        where to_tsvector('english', m) @@ (select tq from query)
        union all
        select 7, h.era
        where h.era is not null and to_tsvector('english', h.era) @@ (select tq from query)
      ) matched
      limit 4
    ) as matched_via,
    h.rank as score,
    h.total
  from hits h
  order by h.rank desc, h.id
$$;

comment on function public.search_catalog_keyword(text, int) is
  'Keyword/metadata search over catalog.prop_items. AND across tokens, prefix match on the trailing token, weighted by field. Returns the card projection plus matched_via chips and the full match count. security invoker, so catalog RLS applies.';

grant execute on function public.search_catalog_keyword(text, int) to anon, authenticated, service_role;
