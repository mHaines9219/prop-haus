-- ============================================================================
-- The backfill loop: drop the GIN, measure EVERY chunk, rebuild the index after.
--
-- Three changes, each from someone else's measurement rather than my reasoning.
--
-- 1. DROP THE GIN BEFORE THE LOOP  (Honey, 16:49)
--
-- Two arms on scratch, both verified to end with identical data (92,000 rows
-- each, `except` returns zero):
--
--   index-first (what 190000 does)   769,427 buffers   8.36/row   GIN 11 MB
--   index-after                      337,521 buffers   3.67/row   GIN 8.7 MB
--
-- Insert cost halves AND the resulting index is 23% smaller. The second is the
-- one that matters more: incremental GIN insertion leaves a permanently less
-- compact index than a sorted bulk build, so it is a cost on every read
-- afterwards rather than once during a backfill.
--
-- 190000 built the GIN over an empty table and I argued for that on the grounds
-- that building it afterwards would be one unbounded statement. That argument was
-- about the WIDE table's 90k-row CREATE INDEX; on a narrow two-column relation it
-- does not carry, and I transplanted it without re-checking. Keyword search is
-- unavailable while the index is gone, which costs nothing -- it has never been
-- live (170100 was never applied, 150000 revoked the RPC).
--
-- Honey's caveats kept: their text is synthetic so the absolute numbers do not
-- transfer, only the shape -- pending-list batching and bulk-vs-incremental build
-- are GIN properties. And the CREATE INDEX cost is UNMEASURED, not small: EXPLAIN
-- does not cover DDL, their pg_stat_database deltas read 0 because the collector
-- is asynchronous, and 230ms is wall clock in the unit this project just
-- discredited. The rebuild gets measured in 20260802190500 and it may eat some of
-- the 2x.
--
-- 2. EVERY CHUNK RECORDS. NO SAMPLING, AND NO WAY TO ADD IT.  (Bumble, 16:51)
--
-- A single chunk cannot measure this path. GIN fastupdate batches insertions into
-- a pending list and the flush lands on ONE statement roughly every 11 chunks of
-- 2,000 -- about every 22,000 rows. Honey's own first pass sampled 9 chunks of 46,
-- missed all three flushes, and read a beautifully flat 5.4 -> 6.7 that was not
-- there. My gate (20260802190100) totalled 2,250 rows and therefore could not
-- have spanned a flush cycle at all: its 14.8-15.8 buffers/row is a no-flush
-- trough and a LOWER BOUND, not an estimate.
--
-- Bumble asked for a header line saying the loop must not grow a `--sample` flag.
-- Stronger version: the function has no way to skip recording. Measurement is not
-- a mode, it is the only path -- so "record every 10th chunk for tidiness" is not
-- a flag someone can add, it is a rewrite they would have to justify. 46 rows in
-- catalog.measurements is nothing, and the amortised rate is
-- sum(buffers)/sum(rows) over the COMPLETE set or it is not the amortised rate.
--
-- 3. THE RATE COMES FROM THE LOOP, NOT FROM MULTIPLYING THE GATE
--
-- I published `90,953 x 15.4 = ~1.4 million page accesses` in a draft and Honey
-- caught it before it went out. Withdrawn and not replaced with a better guess.
-- After this loop runs, the whole-table figure is a query over 46 measured chunks.
--
-- PRE-REGISTERED COST, per the standing rule
--
-- Each chunk is its own statement. At the gate's trough rate a 2,000-row chunk is
-- ~30,000 buffers and took 3.4s; flush chunks may be ~2x that. So no single
-- statement here is expected near the 30-second threshold, and the total is ~46
-- statements of a few seconds each rather than one long one. That bounding -- many
-- small statements instead of one big one -- is the whole point of the design and
-- the reason the read-health abort in the driver can act between chunks.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The GIN comes off. Rebuilt in 20260802190500 after the loop.
-- ---------------------------------------------------------------------------
drop index if exists catalog.prop_item_keywords_tsv_idx;

-- ---------------------------------------------------------------------------
-- 2. The chunk function, now self-measuring. Same name, same contract --
--    returns rows written, 0 when complete -- so scripts/backfill-keyword-tsv.ts
--    needs no change.
--
--    The EXPLAIN executes the insert; that is the point, it is not a dry run.
--    The measurement insert commits with the chunk rather than being wrapped
--    separately, which is correct here for the reason Honey established as shape
--    C: it is not inside any WRAPPING transaction that a later failure could roll
--    back. Each chunk is one autonomous statement, and if chunk 30 fails, chunks
--    1-29 keep both their rows and their measurements.
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
  p      jsonb;
begin
  -- Reachable over the Data API, so the caller does not get to ask for a chunk
  -- big enough to reproduce the July incident.
  chunk_size := least(greatest(coalesce(chunk_size, 2000), 1), 20000);

  select coalesce(max(k.id), '') into cursor from catalog.prop_item_keywords k;

  -- Ascending-id cursor rather than an anti-join: rows are inserted in id order,
  -- so max(id) IS the high-water mark and finding the next chunk is one index
  -- descent plus a short range scan. An anti-join would make the backfill
  -- quadratic, which is the mistake the partial index existed to avoid in the
  -- abandoned in-place design.
  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'insert into catalog.prop_item_keywords (id, keyword_tsv) '
    || 'select i.id, catalog.keyword_vector(i) from catalog.prop_items i '
    || 'where i.id > %L order by i.id limit %s on conflict (id) do nothing',
    cursor, chunk_size)
  into p;

  n := coalesce((p->0->'Plan'->>'Actual Rows')::int, 0);
  -- ModifyTable reports 0 actual rows without RETURNING; the count lives on the
  -- child scan node.
  if n = 0 then
    n := coalesce((p->0->'Plan'->'Plans'->0->>'Actual Rows')::int, 0);
  end if;

  -- ALWAYS. There is deliberately no branch that skips this.
  insert into catalog.measurements (migration, label, rows_touched, plan)
  values ('20260802190400', 'backfill_chunk', n, p);

  return n;
end;
$$;

comment on function catalog.backfill_keyword_tsv_chunk(int) is
  'Writes keyword vectors for up to chunk_size items not yet in prop_item_keywords, ascending by id, returning the count. Returns 0 when complete. '
  'EVERY call records its own EXPLAIN plan into catalog.measurements -- there is no sampling mode and adding one would silently un-measure the GIN pending-list flush, which lands on roughly one chunk in eleven. The amortised rate is sum(buffers)/sum(rows) over the complete set or it is not the amortised rate. '
  'Maintenance only: service_role.';

-- Grants restated so this file is complete on its own. Both halves of the revoke
-- rule, because 20260802190200 shipped anon-callable by doing only one: `public`
-- is the PUBLIC pseudo-role, and Supabase ALSO grants execute on new functions to
-- anon and authenticated explicitly via default privileges. CREATE OR REPLACE
-- preserves existing grants, so these functions were already safe -- but for a
-- reason nobody had checked, which is not the same as being safe by design.
revoke all on function catalog.backfill_keyword_tsv_chunk(int) from public, anon, authenticated;
revoke all on function public.backfill_keyword_tsv_chunk(int)  from public, anon, authenticated;
grant execute on function catalog.backfill_keyword_tsv_chunk(int) to service_role, catalog_writer;
grant execute on function public.backfill_keyword_tsv_chunk(int)  to service_role;

commit;
