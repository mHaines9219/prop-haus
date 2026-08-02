-- ============================================================================
-- MEASUREMENT — reads plans, runs ANALYZE, changes no stored value.
-- Third and last of the diagnostics; see 20260802170200 and 20260802181000.
--
-- WHERE THE PREVIOUS TWO LEFT IT
--
--   per-row, HOT-eligible (no index maintenance)   188.90 ms/row
--   per-row, not HOT (all eleven indexes)          384.00 ms/row
--   set-based, 50 rows in one statement            179.43 ms/row
--   set-based, 200 rows in one statement            56.09 ms/row
--
-- Fit a line through the two set-based points:
--
--     50 rows   =  8971.6 ms
--    200 rows   = 11217.4 ms
--    ------------------------------
--    marginal   = (11217.4 - 8971.6) / 150 =  14.97 ms/row
--    fixed      =  8971.6 - (50 x 14.97)   = 8224 ms PER STATEMENT
--
-- An eight-second FIXED cost that does not depend on how many rows are touched
-- is not I/O per row and it is not index maintenance. It is the shape of a
-- SEQUENTIAL SCAN over an 890 MB table.
--
-- And that reading retro-explains the thing I could not explain earlier today.
-- The chunk ladder failed at the SAME duration regardless of size —
-- 2000 rows 8334ms, 400 rows 8243ms, 150 rows 8211ms, 50 rows 8352ms, all 57014
-- — which I read as "150ms per row" when a constant duration across a 40x range
-- of row counts means the row count is not what is being paid for. Constant cost
-- for varying work is a scan, and I had the evidence in front of me.
--
-- WHY A SCAN WOULD BE CHOSEN
--
-- keyword_tsv was added minutes ago and has never been analysed, so pg_statistic
-- holds nothing for it. The planner cannot know `keyword_tsv is null` selects
-- 99.97% of the table (or, later, almost none of it), so it has no basis to
-- prefer prop_items_keyword_tsv_todo_idx over a scan.
--
-- If that is right, the fix is ANALYZE — not a side table, not a bigger
-- instance, and not chunking. So this measurement is deliberately ordered to be
-- refutable:
--
--   1. EXPLAIN ANALYZE the chunk update as it stands. Read the actual plan.
--   2. ANALYZE catalog.prop_items.
--   3. EXPLAIN ANALYZE the identical statement again.
--
-- If step 1 shows a Seq Scan and step 3 shows an Index Scan with the fixed cost
-- gone, the diagnosis is proven end to end. If step 1 already shows an index
-- scan, my reading is wrong and the 8.2s is something else — which is worth
-- knowing before anything is built either way.
--
-- NOTE ON `SET LOCAL`, which matters beyond this file
--
-- 20260802181000 emitted `WARNING 25P01: SET LOCAL can only be used in
-- transaction blocks`. So migrations here do NOT run inside a transaction, and
-- every `set local statement_timeout` in this repo's migration history was a
-- NO-OP -- including the `'15min'` one I added in #46 and described as bounding
-- the backfill. It did not bound anything; the ~900s the transaction actually
-- ran was some other limit. I was not correct, I was lucky.
--
-- No `set local` in this file for that reason. The migration path's own timeout
-- is evidently well above 20s, since 20260802181000 ran 20.2s uncancelled --
-- which also means the ~8.2s wall the chunk ladder kept hitting was the
-- PostgREST/service_role timeout, not a database-wide one.
-- ============================================================================

do $$
declare
  lo   text;
  hi   text;
  rec  record;
  t0   timestamptz;
  ms   numeric;
begin
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit 200) s;

  if lo is null then
    raise notice 'no unpopulated rows left; nothing to measure';
    return;
  end if;

  -- --------------------------------------------------------------------------
  -- 1. The plan BEFORE ANALYZE. EXPLAIN ANALYZE executes the statement, which
  --    is fine: it is the same value-preserving no-op as the backfill itself.
  -- --------------------------------------------------------------------------
  raise notice '=== BEFORE ANALYZE ===';
  for rec in
    execute format(
      'explain (analyze, buffers, timing) update catalog.prop_items p '
      || 'set keyword_tsv = p.keyword_tsv where p.id between %L and %L and p.keyword_tsv is null',
      lo, hi)
  loop
    raise notice '%', rec."QUERY PLAN";
  end loop;

  -- --------------------------------------------------------------------------
  -- 2. Give the planner statistics for a column that has never had any.
  -- --------------------------------------------------------------------------
  t0 := clock_timestamp();
  analyze catalog.prop_items;
  ms := extract(epoch from (clock_timestamp() - t0)) * 1000;
  raise notice '=== ANALYZE took % ms ===', round(ms, 1);

  -- --------------------------------------------------------------------------
  -- 3. The identical statement, on the next range, with statistics present.
  -- --------------------------------------------------------------------------
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit 200) s;

  if lo is null then
    raise notice 'no rows left for the after-measurement';
    return;
  end if;

  raise notice '=== AFTER ANALYZE ===';
  for rec in
    execute format(
      'explain (analyze, buffers, timing) update catalog.prop_items p '
      || 'set keyword_tsv = p.keyword_tsv where p.id between %L and %L and p.keyword_tsv is null',
      lo, hi)
  loop
    raise notice '%', rec."QUERY PLAN";
  end loop;
end
$$;
