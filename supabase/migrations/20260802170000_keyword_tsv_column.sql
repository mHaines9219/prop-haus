-- ============================================================================
-- Prop Haus — keyword_tsv, part 1 of 2: the column, the trigger, the chunk step.
--
-- This migration is deliberately CHEAP. It adds a nullable column, extends one
-- trigger, and defines the function that does one bounded slice of the
-- backfill. Nothing here touches more than the catalog's metadata, so it
-- applies in well under a second.
--
-- WHY THIS IS SPLIT FROM THE BACKFILL — the incident, stated once
--
-- 20260802160000 (deleted in this commit) did the column, the trigger, the
-- 90k-row backfill and the RPC rewrite in one transaction. On live that
-- backfill ran for the full 15 minutes and was cancelled by the statement
-- timeout, and while it ran it saturated I/O hard enough that ordinary anon
-- reads of catalog_items failed with 57014 for roughly three minutes. Home,
-- browse, category and item detail were degraded.
--
-- My sizing said 4.1s and no batching needed. Two things made the real failure
-- invisible on the scratch cluster:
--
--   1. 90 MB table against 890 MB live. I stated this caveat.
--   2. NO statement_timeout configured on scratch. I did not state this, and it
--      is the one that mattered. A missing limit does not just change the
--      timing, it REMOVES THE FAILURE MODE. There was no timeout for the
--      backfill to trip and none for a concurrent read to trip either.
--
-- The lock analysis I rested the decision on (UPDATE takes RowExclusiveLock,
-- which does not conflict with a read) was correct and is still correct. It was
-- the wrong thing to rest the decision on: reads did not block on a lock, they
-- failed on a timeout under I/O saturation. Two mechanisms, one user-visible
-- outcome, and only one of them was testable where I tested it.
--
-- So: any future sizing cluster gets the production limit before anything is
-- measured on it —
--
--   alter database <scratch> set statement_timeout = '3s';
--
-- one line, and it converts this whole class of failure from invisible to
-- fails-on-my-machine-first.
--
-- WHAT REPLACES THE SINGLE STATEMENT
--
-- catalog.backfill_keyword_tsv_chunk(n) fills at most n rows and returns how
-- many it filled. Each CALL IS ITS OWN TRANSACTION, driven from outside by
-- scripts/backfill-keyword-tsv.ts over the Data API. That gets three things a
-- procedure with explicit COMMIT could not:
--
--   * No transaction-control problem. `supabase db push` wraps each migration
--     in a transaction, and COMMIT inside a procedure called from there fails
--     with "invalid transaction termination". A function driven from outside
--     sidesteps the question entirely.
--   * Per-chunk timing on live BEFORE the loop is allowed to run. The step I
--     skipped last time was sizing in the place that could actually fail.
--   * Resumability with no bookkeeping. `where keyword_tsv is null` IS the
--     progress marker, so a cancelled run is just a shorter run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The column. Nullable, and it stays nullable — 20260802170100 asserts it is
-- fully populated rather than constraining it, because a NOT NULL added here
-- would have to be validated against 90k rows, which is the exact operation
-- this migration exists to avoid.
-- ---------------------------------------------------------------------------
alter table catalog.prop_items add column if not exists keyword_tsv tsvector;

comment on column catalog.prop_items.keyword_tsv is
  'Weighted tsvector over every field lib/keyword-search.ts searches. Maintained by catalog.prop_items_tsv(). Distinct from search_tsv, which covers six fields for the older keyword path; this one covers all twelve plus vendor name.';

-- ---------------------------------------------------------------------------
-- Extend the EXISTING trigger to write both columns rather than adding a
-- second one — one trigger writing two columns has no ordering question
-- between them. The search_tsv half is unchanged from 20260627190000; the body
-- is restated in full because CREATE OR REPLACE FUNCTION has no partial form.
--
-- This lands BEFORE the backfill on purpose. From the moment it applies, every
-- insert and update writes a correct keyword_tsv — so a catalog load or a
-- single row edit during the backfill window produces populated rows, never
-- stale ones. The backfill is then only responsible for rows that already
-- existed.
--
-- HAZARD, found by tripping over it: while this function references
-- keyword_tsv, dropping that column breaks EVERY write to prop_items,
-- including catalog.swap_in_staging() and therefore the whole catalog load:
--
--   ERROR: record "new" has no field "keyword_tsv"
--
-- A rollback must revert this function before dropping the column, in that
-- order.
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
-- Everything at weight <= 3 collapses into one bucket. That is the largest
-- single source of divergence from the in-memory ranker and it is structural,
-- not tunable. The gap is being measured with pooled graded relevance rather
-- than closed by fitting weights to it.
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

-- catalog.swap_in_staging() needs NO change, and that is worth stating because
-- it is the thing a reviewer should check. It inserts with an EXPLICIT column
-- list that names neither search_tsv nor keyword_tsv, so the trigger above
-- computes both on the way in. prop_items_staging was created with
-- `(like prop_items)` and therefore does not have keyword_tsv; it does not need
-- it, because the column is derived rather than carried.

-- ---------------------------------------------------------------------------
-- The GIN index, built NOW — while the column is entirely null.
--
-- I said in channel that the index should come after the backfill because
-- building over an all-null column and then filling it is more total work. That
-- is true and it is the wrong trade. GIN does not index nulls at all, so this
-- build is instant and the resulting index is empty; the chunked UPDATEs then
-- maintain it incrementally, a few thousand rows at a time.
--
-- Building it afterwards would mean one CREATE INDEX reading all 90k rows in a
-- single statement I cannot bound or resume — the exact shape that caused the
-- outage, just with a different verb. Slightly more total work spread over
-- bounded transactions beats less total work in one unbounded one. That is the
-- whole point of this migration pair, and I nearly exempted the index from it.
--
-- GIN's pending-list (fastupdate, on by default) batches these inserts, so the
-- per-chunk cost stays small rather than paying a full index descent per row.
-- ---------------------------------------------------------------------------
create index if not exists prop_items_keyword_tsv_idx
  on catalog.prop_items using gin (keyword_tsv);

-- ---------------------------------------------------------------------------
-- Progress index. Without it each chunk would have to find its next n unfilled
-- rows by scanning for nulls, and 46 sequential scans of an 890 MB table is
-- more I/O than the single statement that caused the outage — the batching
-- would have made things worse, not better.
--
-- The predicate makes it self-consuming: a row leaves the index as it is
-- filled, so the index shrinks to nothing as the backfill completes and the
-- last chunk is as cheap as the first. Dropped in 20260802170100.
-- ---------------------------------------------------------------------------
create index if not exists prop_items_keyword_tsv_todo_idx
  on catalog.prop_items (id) where keyword_tsv is null;

-- ---------------------------------------------------------------------------
-- One chunk of the backfill.
--
-- The UPDATE assigns keyword_tsv TO ITSELF and lets the trigger compute the
-- real value. That is not a trick for its own sake: it means the weighting
-- expression exists in exactly ONE place. 20260802160000 had it written out
-- twice — once in the trigger, once in the backfill — which is two things that
-- must be edited together forever and a silent wrong-weights bug the first time
-- someone edits only one.
--
-- SECURITY DEFINER because catalog.prop_items is owned by catalog_writer and
-- service_role holds SELECT only (20260627190000). Execute is granted to
-- service_role alone and revoked from everyone else: this is a maintenance
-- entry point, not an API. `set search_path = ''` with fully-qualified names,
-- per the pattern the rest of the catalog functions use.
-- ---------------------------------------------------------------------------
create or replace function catalog.backfill_keyword_tsv_chunk(chunk_size int default 2000)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  -- Clamp: this is reachable over the Data API, so the caller does not get to
  -- ask for a chunk large enough to reproduce the incident.
  chunk_size := least(greatest(coalesce(chunk_size, 2000), 1), 10000);

  update catalog.prop_items p
     set keyword_tsv = p.keyword_tsv
   where p.id in (
     select i.id from catalog.prop_items i
      where i.keyword_tsv is null
      limit chunk_size
   );

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function catalog.backfill_keyword_tsv_chunk(int) is
  'Fills keyword_tsv for at most chunk_size rows that are still null, returning the count. One call = one transaction, so the loop lives in scripts/backfill-keyword-tsv.ts rather than in a procedure. Returns 0 when the backfill is complete. Maintenance only: service_role.';

-- ---------------------------------------------------------------------------
-- Data API surface for the driver script. Thin wrapper because PostgREST can
-- only reach functions in exposed schemas, and `catalog` is not one.
--
-- Not security definer itself — it inherits the definer rights of the function
-- it calls, so the privilege escalation stays in exactly one place.
-- ---------------------------------------------------------------------------
create or replace function public.backfill_keyword_tsv_chunk(chunk_size int default 2000)
returns int
language sql
set search_path = ''
as $$
  select catalog.backfill_keyword_tsv_chunk(chunk_size)
$$;

comment on function public.backfill_keyword_tsv_chunk(int) is
  'Data API entry point for catalog.backfill_keyword_tsv_chunk. service_role only -- anon and authenticated are explicitly revoked below.';

-- Deny by default, then grant the one role that should have it. `public` is
-- revoked explicitly because functions are executable by PUBLIC by default,
-- which is how 20260802020000 ended up anon-callable and burning a statement
-- timeout per request.
revoke all on function catalog.backfill_keyword_tsv_chunk(int) from public;
revoke all on function public.backfill_keyword_tsv_chunk(int)  from public;
grant execute on function catalog.backfill_keyword_tsv_chunk(int) to service_role;
grant execute on function public.backfill_keyword_tsv_chunk(int)  to service_role;
