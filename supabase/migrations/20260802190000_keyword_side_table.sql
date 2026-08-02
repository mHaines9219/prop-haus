-- ============================================================================
-- Prop Haus — keyword search, take three: a narrow side table.
--
-- WHY, WITH THE NUMBER THAT DECIDED IT
--
-- keyword_tsv lived on catalog.prop_items. Populating it there cost ~190ms per
-- row on live, and EXPLAIN (ANALYZE, BUFFERS) says where it went
-- (20260802182000):
--
--   index scan to find 200 rows       34 ms        45 buffers
--   trigger over all twelve fields   104 ms  ->  0.52 ms/row
--   everything else              ~21,500 ms   151,880 buffers
--
-- 151,923 buffers to update 200 rows is 760 buffer accesses PER ROW, in neither
-- the scan nor the trigger. It is the Update node maintaining indexes:
-- catalog.prop_items feeds TWELVE index entries per row version, one of them an
-- HNSW graph over 90,953 halfvec(1536) vectors, where an insert traverses
-- hundreds of index pages.
--
-- The trigger number is the point. 0.52 ms/row to compute the tsvector over all
-- twelve fields — the same order as the 0.09 ms/row a scratch cluster managed.
-- THE WORK WE WANT IS CHEAP. Only the place we were storing it was ruinous.
--
-- So stop writing to that table. An INSERT into a narrow relation with one GIN
-- index cannot pay 760 buffers/row, because those buffers belong to eleven
-- indexes the insert never visits.
--
-- This is not a compromise on query speed either: the RPC filters on the narrow
-- relation's GIN index and joins to prop_items by primary key for only the ~60
-- rows it returns, instead of filtering an 890 MB table.
--
-- REJECTED, with numbers rather than instinct
--
--   * Chunked UPDATEs on prop_items. Rejected on BUFFERS, not on a projected
--     wall clock: ~777 buffer accesses per row is paid whatever the chunk size,
--     so 90,953 rows is ~71 million page accesses however it is sliced. Chunking
--     limits blast radius; it cannot make the total work affordable.
--
--     Every wall-clock projection made today for this path -- ~4 hours, 85
--     minutes, ~26 minutes -- is WITHDRAWN. All of them descend from a fixed
--     per-statement cost fitted to two timing samples, and three measurements of
--     the identical 200-row statement span 3.0x (11.2s / 21.7s / 33.4s). Refit
--     against each in turn and the fitted "fixed cost" moves 8,223 -> 4,723 ->
--     829 ms, which reverses the conclusion. See 20260802183000.
--   * ANALYZE. Tried it. The plan was already an Index Scan BOTH BEFORE AND
--     AFTER, so stale statistics were never the problem -- that is the finding,
--     and it rests on the plan shape, not on any duration. ANALYZE changed only
--     the row estimate, and cost 58.8 seconds. (An earlier version of this file
--     also claimed it made the next statement "SLOWER, 33.4s vs 21.7s". That is
--     withdrawn: step 3 ran on the NEXT 200 rows, so different pages and a
--     different cache state are equally available as explanations and nothing in
--     the output separates them.)
--   * Drop prop_items_embedding_idx, backfill, rebuild. Would work, and
--     load-catalog.ts does exactly this around a bulk load. Still no: the rebuild
--     is one unbounded statement on a table where ANALYZE alone takes 59
--     seconds, and nothing in production reads pgvector today, so that index buys
--     nothing during the window it would cost the most.
--
-- MIGRATIONS HERE ARE NOT TRANSACTIONAL
--
-- 20260802181000 proved it: `WARNING 25P01: SET LOCAL can only be used in
-- transaction blocks`. So every statement below commits on its own and the file
-- is ordered so that no intermediate state breaks a reader or a writer:
--
--   1. Revert the trigger so nothing references prop_items.keyword_tsv.
--   2. Only then drop its indexes and the column. (Reverse that order and every
--      write to prop_items fails with `record "new" has no field "keyword_tsv"`,
--      including swap_in_staging and therefore the whole catalog load.)
--   3. Create the side table and its own maintenance.
--
-- Catalog reads never touch any of this: public.catalog_items has never exposed
-- keyword_tsv, and the RPC that would read it is not applied.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Put the trigger back to exactly what 20260627190000 defined. It must stop
--    referencing keyword_tsv BEFORE the column goes.
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
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Now the column and its indexes can go. Dropping a column is catalog-only
--    in Postgres, so this is fast regardless of table size.
-- ---------------------------------------------------------------------------
drop index if exists catalog.prop_items_keyword_tsv_idx;
drop index if exists catalog.prop_items_keyword_tsv_todo_idx;
drop function if exists public.backfill_keyword_tsv_chunk(int);
drop function if exists catalog.backfill_keyword_tsv_chunk(int);
alter table catalog.prop_items drop column if exists keyword_tsv;

-- ---------------------------------------------------------------------------
-- 3. The weighting expression, in ONE place.
--
-- 20260802160000 had these twelve fields written out twice — once in the trigger
-- and once in the backfill — which is two copies that must be edited together
-- forever and a silent wrong-weights bug the first time someone edits one. Now
-- the trigger and the backfill both call this.
--
-- immutable is correct: to_tsvector(regconfig, text) is immutable, unlike the
-- one-argument form that depends on default_text_search_config.
--
-- WEIGHTS, AND WHERE THEY CANNOT MATCH lib/keyword-search.ts
--
-- Six distinct weights there; four labels in a tsvector. The mapping keeps every
-- distinct weight down to 4 and collapses the tail:
--
--   A  name                                              6
--   B  subcategory                                       5
--   C  category, tags, style, colors, materials, era      4
--   D  vibes, settingType, genreFit, description, vendor  3 2 1
--
-- Everything at weight <= 3 collapses into one bucket. That is the largest
-- single source of divergence and it is structural, not tunable. The gap is
-- being measured with pooled graded relevance rather than closed by fitting
-- weights to it.
-- ---------------------------------------------------------------------------
create or replace function catalog.keyword_vector(p catalog.prop_items)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    setweight(to_tsvector('english', coalesce(p.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p.subcategory, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(p.category, '') || ' ' ||
      coalesce(array_to_string(p.tags, ' '), '') || ' ' ||
      coalesce(array_to_string(p.style, ' '), '') || ' ' ||
      coalesce(array_to_string(p.colors, ' '), '') || ' ' ||
      coalesce(array_to_string(p.materials, ' '), '') || ' ' ||
      coalesce(p.era, '')), 'C') ||
    setweight(to_tsvector('english',
      coalesce(array_to_string(p.vibes, ' '), '') || ' ' ||
      coalesce(array_to_string(p.setting_type, ' '), '') || ' ' ||
      coalesce(array_to_string(p.genre_fit, ' '), '') || ' ' ||
      coalesce(p.description, '') || ' ' ||
      -- Vendor name is searchable ("newel") at the lowest weight, matching
      -- lib/keyword-search.ts. It lives in the vendor jsonb, not a column.
      coalesce(p.vendor->>'name', '')), 'D')
$$;

comment on function catalog.keyword_vector(catalog.prop_items) is
  'The weighted tsvector for keyword search, in one place. Called by catalog.prop_item_keywords_sync() and by the backfill so the two cannot drift. NOT for use in an expression index -- that is what made the RPC in #31 exceed the statement timeout.';

-- ---------------------------------------------------------------------------
-- 4. The side table. Narrow on purpose: two columns, one GIN index, and no
--    HNSW, no tags index, no partial image indexes. That absence IS the fix.
--
-- The FK guarantees there can be no keyword row without an item, which matters
-- because the RPC joins through it -- an orphan would be a search hit that
-- resolves to nothing, the exact failure check-store-agreement exists to catch.
-- ---------------------------------------------------------------------------
create table if not exists catalog.prop_item_keywords (
  id          text primary key
                references catalog.prop_items(id) on delete cascade,
  keyword_tsv tsvector not null
);

comment on table catalog.prop_item_keywords is
  'Weighted keyword tsvector per prop item, held apart from prop_items because writing it there cost ~190ms/row -- 760 buffer accesses maintaining twelve indexes including an HNSW graph. See 20260802182000 for the plan that measured it.';

create index if not exists prop_item_keywords_tsv_idx
  on catalog.prop_item_keywords using gin (keyword_tsv);

alter table catalog.prop_item_keywords enable row level security;

create policy "keyword vectors are publicly readable" on catalog.prop_item_keywords
  for select to anon, authenticated using (true);

grant select on catalog.prop_item_keywords to anon, authenticated, service_role;
grant all privileges on catalog.prop_item_keywords to catalog_writer;
alter table catalog.prop_item_keywords owner to catalog_writer;

-- ---------------------------------------------------------------------------
-- 5. Keep it in step with prop_items on every write.
--
-- AFTER rather than BEFORE, and on prop_items rather than on this table: the row
-- must exist before the FK will accept a reference to it.
--
-- This fires per row during a catalog load, which is 90k narrow single-column
-- upserts. That is affordable precisely because this table has one index -- the
-- same reason the backfill is affordable, applied to the steady state.
-- ---------------------------------------------------------------------------
create or replace function catalog.prop_item_keywords_sync()
returns trigger
language plpgsql
set search_path = catalog, pg_temp
as $$
begin
  insert into catalog.prop_item_keywords (id, keyword_tsv)
  values (new.id, catalog.keyword_vector(new))
  on conflict (id) do update set keyword_tsv = excluded.keyword_tsv;
  return null;  -- AFTER trigger: the return value is ignored
end;
$$;

drop trigger if exists prop_item_keywords_sync on catalog.prop_items;
create trigger prop_item_keywords_sync
  after insert or update on catalog.prop_items
  for each row execute function catalog.prop_item_keywords_sync();

-- ---------------------------------------------------------------------------
-- 6. swap_in_staging has to know about the new table.
--
-- `truncate catalog.prop_items` alone now fails -- Postgres refuses to truncate a
-- table referenced by a foreign key unless the referencing table goes in the
-- same command. Truncating both together is also what we want: the trigger above
-- repopulates as the rows come back, so the swap stays atomic and readers still
-- see the old catalog until COMMIT.
--
-- Body otherwise unchanged from 20260802031000, restated in full because CREATE
-- OR REPLACE FUNCTION has no partial form.
-- ---------------------------------------------------------------------------
create or replace function catalog.swap_in_staging()
returns bigint
language plpgsql
set search_path = catalog, extensions, pg_temp
as $$
declare
  n bigint;
begin
  truncate catalog.prop_items, catalog.prop_item_keywords;
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
-- 7. One chunk of the backfill.
--
-- Ascending-id cursor rather than an anti-join. Rows are inserted in id order,
-- so max(id) in the side table IS the high-water mark: finding the next chunk is
-- one index descent plus a short range scan, not a pass over 90k rows per chunk.
-- An anti-join here would make the backfill quadratic, which is the mistake the
-- partial index existed to avoid in the previous design.
--
-- Same name and same contract as the function it replaces -- returns rows written,
-- 0 when complete -- so scripts/backfill-keyword-tsv.ts needs no change.
--
-- SECURITY DEFINER because prop_items is owned by catalog_writer and service_role
-- holds SELECT only. Execute is granted to service_role alone.
-- ---------------------------------------------------------------------------
create or replace function catalog.backfill_keyword_tsv_chunk(chunk_size int default 2000)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n      int;
  cursor text;
begin
  -- Reachable over the Data API, so the caller does not get to ask for a chunk
  -- big enough to reproduce the incident.
  chunk_size := least(greatest(coalesce(chunk_size, 2000), 1), 20000);

  select coalesce(max(k.id), '') into cursor from catalog.prop_item_keywords k;

  insert into catalog.prop_item_keywords (id, keyword_tsv)
  select p.id, catalog.keyword_vector(p)
    from catalog.prop_items p
   where p.id > cursor
   order by p.id
   limit chunk_size
  on conflict (id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function catalog.backfill_keyword_tsv_chunk(int) is
  'Writes keyword vectors for up to chunk_size items not yet in prop_item_keywords, ascending by id, returning the count. One call = one transaction; the loop lives in scripts/backfill-keyword-tsv.ts. Returns 0 when complete. Maintenance only: service_role.';

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
-- which is how 20260802020000 ended up anon-callable burning a statement timeout
-- per call.
revoke all on function catalog.backfill_keyword_tsv_chunk(int) from public;
revoke all on function public.backfill_keyword_tsv_chunk(int)  from public;
grant execute on function catalog.backfill_keyword_tsv_chunk(int) to service_role, catalog_writer;
grant execute on function public.backfill_keyword_tsv_chunk(int)  to service_role;
