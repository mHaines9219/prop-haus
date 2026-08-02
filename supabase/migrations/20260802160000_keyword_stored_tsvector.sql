-- ============================================================================
-- Prop Haus — keyword search that does not time out
--
-- THE PROBLEM, MEASURED
--
-- The RPC from #31 exceeded the statement timeout on ordinary single-word
-- queries, through the Data API as anon:
--
--   couch  limit 1     176ms  total 85
--   brass  limit 1    3491ms  ERR 57014 statement timeout
--   blue   limit 1    3494ms  ERR 57014
--   lamp   limit 1    3507ms  ERR 57014
--
-- `limit` did not help, which is the diagnostic: cost tracked the number of
-- MATCHES, not the number of rows returned. Two causes.
--
--   1. ts_rank(catalog.prop_item_document(p), tq) recomputed a twelve-field
--      tsvector for every matching row. The GIN index satisfied the @@ filter
--      but had no stored value to rank on.
--   2. count(*) over () materialised every match before LIMIT.
--
-- #31's own header rejected a stored column as too expensive because of the
-- backfill. The timeout is the argument that a one-time backfill is the cheaper
-- side of that trade.
--
-- WHAT THIS DOES
--
--   * Adds catalog.prop_items.keyword_tsv, maintained by the EXISTING
--     prop_items_tsv trigger rather than a second one — one trigger writing two
--     columns has no ordering question between them.
--   * Backfills it.
--   * Replaces search_catalog_keyword to rank on the stored column and to drop
--     the window function.
--   * Re-grants execute to anon, because the query is now cheap. Per Bumble:
--     off and obviously off, or on and fast, never on and quietly broken.
--
-- WEIGHTS, AND WHERE THEY CANNOT MATCH
--
-- lib/keyword-search.ts uses six distinct weights; a tsvector has four labels.
-- The mapping keeps every distinct weight down to 4 and collapses the tail:
--
--   A  name                                              6
--   B  subcategory                                       5
--   C  category, tags, style, colors, materials, era      4
--   D  vibes, settingType, genreFit, description, vendor  3 2 1
--
-- ts_rank is then called with {D,C,B,A} = {0.17, 0.67, 0.83, 1.0}, which is
-- 1/6, 4/6, 5/6, 6/6 — a closer match to the hand-tuned ratios than Postgres's
-- defaults of {0.1, 0.2, 0.4, 1.0}. This is an approximation and is expected to
-- reorder results relative to the in-memory ranker; that gap is being measured
-- separately with pooled graded relevance rather than closed by tuning here.
--
-- NOT PRESERVED, deliberately: mid-word substring matching. The in-memory
-- ranker uses norm.includes(token), so "ouc" matches "couch". Postgres text
-- search is token-based. Leading substrings are covered by the :* prefix on the
-- trailing token; interior ones are not, and are not worth a trigram index over
-- twelve fields on 90k rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Lift the statement timeout for this migration only.
--
-- The first attempt at applying this to live failed on the backfill with
-- 57014 -- the same statement timeout the RPC used to trip. On the scratch
-- cluster the backfill took 4.1s and there was no timeout configured, so the
-- sizing run could not surface this. That was the stated caveat (90 MB scratch
-- table against 890 MB live) landing exactly where it was predicted to.
--
-- SET LOCAL rather than a plain SET: it reverts at the end of the transaction
-- the migration runs in, so nothing else inherits an unbounded timeout.
--
-- This is preferable to batching. Batching would need transaction control
-- inside a procedure, which means the backfill is no longer atomic with the
-- trigger change that depends on it -- and a half-populated keyword_tsv behind
-- a trigger that assumes it exists is a worse failure than a slow migration.
-- The lock analysis still holds: the UPDATE takes RowExclusiveLock and reads
-- are never blocked, so a long statement here costs nothing user-facing.
-- ---------------------------------------------------------------------------
set local statement_timeout = '15min';

-- ---------------------------------------------------------------------------
-- The column and its index.
-- ---------------------------------------------------------------------------
alter table catalog.prop_items add column if not exists keyword_tsv tsvector;

comment on column catalog.prop_items.keyword_tsv is
  'Weighted tsvector over every field lib/keyword-search.ts searches. Maintained by catalog.prop_items_tsv(). Distinct from search_tsv, which covers six fields for the older keyword path; this one covers all twelve plus vendor name.';

-- ---------------------------------------------------------------------------
-- Extend the existing trigger to write both columns. Body restated in full
-- because CREATE OR REPLACE FUNCTION has no partial form; the search_tsv half
-- is unchanged from 20260627190000.
-- ---------------------------------------------------------------------------
create or replace function catalog.prop_items_tsv()
returns trigger
language plpgsql
set search_path = catalog, pg_temp
as $$
begin
  new.search_tsv := to_tsvector('english',
    coalesce(new.name, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(new.style, ' '), '') || ' ' ||
    coalesce(new.category, '') || ' ' ||
    coalesce(new.subcategory, '')
  );

  new.keyword_tsv :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.subcategory, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(new.category, '') || ' ' ||
      coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
      coalesce(array_to_string(new.style, ' '), '') || ' ' ||
      coalesce(array_to_string(new.colors, ' '), '') || ' ' ||
      coalesce(array_to_string(new.materials, ' '), '') || ' ' ||
      coalesce(new.era, '')), 'C') ||
    setweight(to_tsvector('english',
      coalesce(array_to_string(new.vibes, ' '), '') || ' ' ||
      coalesce(array_to_string(new.setting_type, ' '), '') || ' ' ||
      coalesce(array_to_string(new.genre_fit, ' '), '') || ' ' ||
      coalesce(new.description, '') || ' ' ||
      -- Vendor name is searchable ("newel") at the lowest weight, matching
      -- lib/keyword-search.ts. It lives in the vendor jsonb, not a column.
      coalesce(new.vendor->>'name', '')), 'D');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill. Sized on a scratch PostgreSQL 15 cluster loaded with the real
-- catalog before this ran anywhere near the live project; see the PR for the
-- timing. Single statement rather than batched on that evidence.
-- ---------------------------------------------------------------------------
update catalog.prop_items set keyword_tsv =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subcategory, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(category, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '') || ' ' ||
      coalesce(array_to_string(style, ' '), '') || ' ' ||
      coalesce(array_to_string(colors, ' '), '') || ' ' ||
      coalesce(array_to_string(materials, ' '), '') || ' ' ||
      coalesce(era, '')), 'C') ||
    setweight(to_tsvector('english',
      coalesce(array_to_string(vibes, ' '), '') || ' ' ||
      coalesce(array_to_string(setting_type, ' '), '') || ' ' ||
      coalesce(array_to_string(genre_fit, ' '), '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(vendor->>'name', '')), 'D')
where keyword_tsv is null;

create index if not exists prop_items_keyword_tsv_idx
  on catalog.prop_items using gin (keyword_tsv);

-- The expression index and document function from #31 are now dead weight: the
-- ranking reads the stored column and the filter uses the index above.
drop index if exists catalog.prop_items_keyword_idx;
drop function if exists catalog.prop_item_document(catalog.prop_items);

-- ---------------------------------------------------------------------------
-- Token list, so matched_via can test fields per token instead of against the
-- AND-ed query. Same sanitising as keyword_tsquery: user input reaches this
-- straight from a query string.
-- ---------------------------------------------------------------------------
create or replace function catalog.keyword_tokens(q text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_remove(
      regexp_split_to_array(
        lower(regexp_replace(coalesce(q, ''), '[^\w\s]+', ' ', 'g')), '\s+'),
      ''),
    '{}'::text[])
$$;

grant execute on function catalog.keyword_tokens(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The RPC. `total` is gone: an unfiltered count comes from catalog_facets(),
-- and a filtered count is cheap on the partial indexes from 20260802030000.
-- Dropped rather than replaced because the output columns change (42P13).
-- ---------------------------------------------------------------------------
drop function if exists public.search_catalog_keyword(text, int);

create function public.search_catalog_keyword(q text, max_results int default 60)
returns table (
  id           text,
  source       text,
  source_id    text,
  name         text,
  subcategory  text,
  images       text[],
  matched_via  text[],
  score        real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    select catalog.keyword_tsquery(q) as tq,
           catalog.keyword_tokens(q)  as toks
  ),
  hits as (
    select p.id, p.source, p.source_id, p.name, p.subcategory, p.category,
           p.images, p.tags, p.style, p.colors, p.materials, p.era,
           -- {D,C,B,A}: 1/6, 4/6, 5/6, 6/6, approximating the hand-tuned
           -- 1 / 4 / 5 / 6 rather than Postgres's default 0.1/0.2/0.4/1.0.
           ts_rank('{0.17, 0.67, 0.83, 1.0}'::float4[],
                   p.keyword_tsv, (select tq from query)) as rank
    from catalog.prop_items p
    where (select tq from query) is not null
      and p.keyword_tsv @@ (select tq from query)
    order by rank desc, p.id
    limit least(greatest(coalesce(max_results, 60), 1), 200)
  )
  select
    h.id, h.source, h.source_id, h.name, h.subcategory, h.images,
    -- Chip fields whose value matches ANY token, in the weight order
    -- lib/keyword-search.ts uses, capped at four the same way. Testing each
    -- field against the whole AND-ed tsquery is what left multi-token queries
    -- with no chips at all -- one field had to contain every token.
    (
      select array_agg(v order by ord)
      from (
        select ord, v from (
          select 1 as ord, h.subcategory as v
          union all select 2, h.category
          union all select 3, t from unnest(coalesce(h.tags, '{}')) t
          union all select 4, s from unnest(coalesce(h.style, '{}')) s
          union all select 5, c from unnest(coalesce(h.colors, '{}')) c
          union all select 6, m from unnest(coalesce(h.materials, '{}')) m
          union all select 7, h.era
        ) cand
        where cand.v is not null
          and exists (
            select 1 from unnest((select toks from query)) tok
            where to_tsvector('english', cand.v) @@ to_tsquery('english', quote_literal(tok) || ':*')
          )
        limit 4
      ) matched
    ) as matched_via,
    h.rank as score
  from hits h
  order by h.rank desc, h.id
$$;

comment on function public.search_catalog_keyword(text, int) is
  'Keyword/metadata search over catalog.prop_items. AND across tokens, prefix match on the trailing token, ranked on the stored keyword_tsv with weights approximating lib/keyword-search.ts. Returns the card projection plus matched_via chips. No total -- use catalog_facets() for an unfiltered count. security invoker, so catalog RLS applies.';


-- Re-granted because the query is now cheap. 20260802150000 revoked this from
-- public/anon/authenticated while it could burn a statement timeout per call.
grant execute on function public.search_catalog_keyword(text, int)
  to anon, authenticated, service_role;
