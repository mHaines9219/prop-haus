-- ============================================================================
-- Prop Haus — keyword_tsv, part 2 of 2: switch the RPC onto the stored column.
--
-- Every statement in this migration is METADATA ONLY. No table is scanned, no
-- index is built, nothing is rewritten. It applies in milliseconds regardless of
-- catalog size, which is the property 20260802160000 did not have.
--
-- IT MUST NOT BE APPLIED UNTIL THE BACKFILL IS COMPLETE, and it enforces that
-- itself rather than trusting whoever runs it:
--
--   pnpm db:backfill-keyword-tsv      (drives 20260802170000's chunk function)
--   supabase db push                  (this migration)
--
-- If any row still has a null keyword_tsv, the assert below aborts the whole
-- transaction. A partially-backfilled column behind an RPC that ranks on it
-- would not error — it would silently return fewer results than the catalog
-- contains, which is the worst failure available here because it looks like
-- a relevance problem rather than a data problem.
--
-- THE PROBLEM THIS FIXES, MEASURED
--
-- The RPC applied out-of-band from unmerged #31 exceeded the statement timeout
-- on ordinary single-word queries, through the Data API as anon:
--
--   couch  limit 1     176ms  total 85
--   brass  limit 1    3491ms  ERR 57014 statement timeout
--   blue   limit 1    3494ms  ERR 57014
--   lamp   limit 1    3507ms  ERR 57014
--
-- `limit` did not help, which is the diagnostic: cost tracked the number of
-- MATCHES, not the number of rows returned. Two causes, both fixed here.
--
--   1. ts_rank(catalog.prop_item_document(p), tq) recomputed a twelve-field
--      tsvector for every matching row. The GIN index satisfied the @@ filter
--      but there was no stored value to rank on. Now ranks on keyword_tsv.
--   2. count(*) over () materialised every match before LIMIT. Dropped — an
--      unfiltered count comes from catalog_facets(), and a filtered count is
--      cheap on the partial indexes from 20260802030000.
--
-- On a scratch cluster loaded with the real 90,816-item catalog, the same
-- queries that returned 57014 at ~3.5s:
--
--   couch 76ms · brass 69ms · blue 74ms · lamp 83ms
--   blue couch 66ms (5 rows) · velvet sofa 76ms · mid century lamp 71ms
--
-- Scoping that honestly, because I over-claimed from this cluster once already:
-- these are RANKING timings on a 90 MB table, and they are the thing the stored
-- column actually changes. They are not evidence about I/O saturation or about
-- prefix fan-out on `pr:*`, which is measured separately against live.
--
-- WHY catalog.keyword_tsquery IS (RE)DEFINED HERE
--
-- It exists on the live database but in NO merged migration — I applied unmerged
-- #31 out-of-band, then repaired its history row to `reverted`, which left the
-- objects live with nothing in the repo that creates them. 20260802150000
-- documented that for search_catalog_keyword and guarded its revoke with an
-- `if exists` for exactly this reason.
--
-- What that note missed is that 20260802160000 then *depended* on
-- keyword_tsquery being there. It applied against live only because of my drift;
-- on a fresh database, or after `supabase db reset`, it would have failed with
-- "function catalog.keyword_tsquery(text) does not exist". Defining it here with
-- CREATE OR REPLACE makes the migration set self-contained in both states.
--
-- NOT PRESERVED, deliberately: mid-word substring matching. The in-memory
-- ranker uses norm.includes(token), so "ouc" matches "couch". Postgres text
-- search is token-based. Leading substrings are covered by the :* prefix on the
-- trailing token; interior ones are not, and are not worth a trigram index over
-- twelve fields on 90k rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The gate. Cheap: prop_items_keyword_tsv_todo_idx from 20260802170000 is a
-- partial index on exactly these rows, so this is an index-only scan that
-- touches nothing when the backfill is done.
-- ---------------------------------------------------------------------------
do $$
declare
  remaining bigint;
begin
  select count(*) into remaining
    from catalog.prop_items where keyword_tsv is null;

  if remaining > 0 then
    raise exception
      'keyword_tsv backfill incomplete: % rows still null. Run `pnpm db:backfill-keyword-tsv` to completion before applying this migration.',
      remaining;
  end if;

  raise notice 'keyword_tsv backfill verified complete (0 rows null)';
end
$$;

-- The progress index has done its job and its predicate now matches no rows.
drop index if exists catalog.prop_items_keyword_tsv_todo_idx;

-- ---------------------------------------------------------------------------
-- Query builder. AND across tokens; only the trailing token gets a prefix.
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

grant execute on function catalog.keyword_tsquery(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Token list, so matched_via can test fields per token instead of against the
-- AND-ed query. Same sanitising as keyword_tsquery: user input reaches this
-- straight from a query string.
--
-- Defined BEFORE search_catalog_keyword because a SQL function body is parsed
-- at creation time — referencing it first fails outright.
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
-- The expression index and document function from #31 are now dead weight: the
-- ranking reads the stored column and the filter uses the GIN index on it.
-- ---------------------------------------------------------------------------
drop index if exists catalog.prop_items_keyword_idx;
drop function if exists catalog.prop_item_document(catalog.prop_items);

-- ---------------------------------------------------------------------------
-- The RPC. Dropped rather than replaced because the output columns change:
-- `total` is gone, and CREATE OR REPLACE FUNCTION cannot change a return type
-- (42P13).
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

-- ---------------------------------------------------------------------------
-- Re-granted because the query is now cheap. 20260802150000 revoked this from
-- public/anon/authenticated while it could burn a statement timeout per call.
-- Per Bumble: off and obviously off, or on and fast, never on and quietly
-- broken.
--
-- The revoke from `public` is kept in place — these are explicit role grants,
-- which is what should be granting access, not Postgres's default PUBLIC grant.
-- ---------------------------------------------------------------------------
revoke all on function public.search_catalog_keyword(text, int) from public;
grant execute on function public.search_catalog_keyword(text, int)
  to anon, authenticated, service_role;
