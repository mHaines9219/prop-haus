-- ============================================================================
-- MEASUREMENT ONLY — creates nothing, drops nothing. Writes exactly 10 rows.
--
-- Why a migration: `db push` is the only channel this project has for running
-- SQL against the live database, so a measurement has to arrive as one. This
-- file leaves no object behind. It exists so the number it produces is
-- recorded in the repo next to the decision it drove, rather than in a
-- transcript.
--
-- WHAT IT WRITES, stated because an earlier version of this header claimed it
-- wrote nothing. Every UPDATE assigns keyword_tsv to itself, but the BEFORE
-- UPDATE trigger then recomputes it — which is the entire mechanism under test:
--
--   * Arm A, 5 already-populated rows: the trigger writes back the identical
--     value. Genuinely no stored value changes.
--   * Arm B, 5 rows where keyword_tsv IS NULL: the trigger writes null -> a
--     real tsvector. Those 5 rows ARE modified, permanently.
--
-- Arm B's writes are forward progress — the values are exactly what the backfill
-- would have written — so this is harmless. It is documented anyway, because a
-- measurement file that claims it writes nothing while writing five rows is the
-- kind of comment that gets trusted the next time someone reaches for it.
--
-- THE QUESTION
--
-- A chunked backfill of catalog.prop_items.keyword_tsv costs ~150ms PER ROW on
-- live (measured: 1 row 539ms, 5 rows 954ms, 20 rows 3343ms, 50 rows exceeded
-- the 8s statement timeout). On a scratch cluster holding the same 90k rows it
-- was 0.09ms/row. That is ~1,600x, and 90,953 rows at 150ms is about 3.8 hours
-- of continuous I/O against the live instance.
--
-- The suspected cause is INDEX MAINTENANCE, not the tsvector computation. Every
-- UPDATE that changes an indexed column value writes a new row version into
-- EVERY index on the table, and catalog.prop_items carries eleven — including
-- an HNSW index over 90,953 halfvec(1536) vectors, where an insert means
-- detoasting a 3 KB vector and walking a graph.
--
-- Suspected is not measured, which is the mistake this project has already paid
-- for twice today. So:
--
-- THE TEST, and why it isolates exactly one variable
--
-- Heap-Only Tuple (HOT) updates skip index maintenance entirely, and Postgres
-- chooses HOT when no INDEXED COLUMN VALUE changes. The trigger
-- catalog.prop_items_tsv() recomputes keyword_tsv on every update, so:
--
--   * On a row where keyword_tsv is ALREADY populated, the trigger recomputes
--     the identical value. Nothing indexed changes -> HOT eligible -> no index
--     maintenance.
--   * On a row where keyword_tsv is NULL, the same trigger changes it from null
--     to a value. keyword_tsv is indexed -> NOT HOT -> all eleven indexes are
--     maintained.
--
-- IT IS THE SAME STATEMENT IN BOTH CASES. Identical SQL, identical trigger,
-- identical tsvector computation over the same twelve fields. The only
-- difference is whether the result changes an indexed value. So the delta is
-- index maintenance and nothing else — it cannot be the tsvector work, the row
-- width, the TOAST reads for the text fields, or the trigger overhead, because
-- both arms pay all of those equally.
--
-- If HOT is milliseconds and non-HOT is ~150ms, index maintenance is the cause
-- and the fix is to stop updating this table: move keyword_tsv to a narrow side
-- table populated by INSERT.
--
-- If BOTH arms are slow, the hypothesis is wrong, a side table would not help,
-- and this needs rethinking before anything is built.
-- ============================================================================

do $$
declare
  ids        text[];
  one_id     text;
  t0         timestamptz;
  per_row    numeric;
  hot_total  numeric := 0;
  hot_n      int := 0;
  cold_total numeric := 0;
  cold_n     int := 0;
begin
  -- ---------------------------------------------------------------------------
  -- ARM A — keyword_tsv already populated. Trigger writes the same value, so no
  -- indexed value changes and the update is HOT-eligible.
  -- ---------------------------------------------------------------------------
  select array_agg(id) into ids
  from (select id from catalog.prop_items where keyword_tsv is not null limit 5) s;

  if ids is null or cardinality(ids) < 5 then
    raise exception 'need at least 5 already-populated rows to measure arm A; found %',
      coalesce(cardinality(ids), 0);
  end if;

  foreach one_id in array ids loop
    t0 := clock_timestamp();
    update catalog.prop_items p set keyword_tsv = p.keyword_tsv where p.id = one_id;
    per_row := extract(epoch from (clock_timestamp() - t0)) * 1000;
    hot_total := hot_total + per_row;
    hot_n := hot_n + 1;
    raise notice 'A  HOT-eligible (already populated)  %  % ms', one_id, round(per_row, 1);
  end loop;

  -- ---------------------------------------------------------------------------
  -- ARM B — keyword_tsv null. Same statement; the trigger changes an indexed
  -- value, so every index on the table is maintained.
  -- ---------------------------------------------------------------------------
  select array_agg(id) into ids
  from (select id from catalog.prop_items where keyword_tsv is null limit 5) s;

  if ids is null or cardinality(ids) < 5 then
    raise exception 'need at least 5 unpopulated rows to measure arm B; found %',
      coalesce(cardinality(ids), 0);
  end if;

  foreach one_id in array ids loop
    t0 := clock_timestamp();
    update catalog.prop_items p set keyword_tsv = p.keyword_tsv where p.id = one_id;
    per_row := extract(epoch from (clock_timestamp() - t0)) * 1000;
    cold_total := cold_total + per_row;
    cold_n := cold_n + 1;
    raise notice 'B  NOT HOT (null -> value)           %  % ms', one_id, round(per_row, 1);
  end loop;

  raise notice '----------------------------------------------------------------';
  raise notice 'A  HOT-eligible   mean % ms over % rows', round(hot_total / hot_n, 1), hot_n;
  raise notice 'B  NOT HOT        mean % ms over % rows', round(cold_total / cold_n, 1), cold_n;
  raise notice 'ratio B/A         %x', round(cold_total / greatest(hot_total, 0.001), 1);
  raise notice '----------------------------------------------------------------';
  raise notice 'Same statement, same trigger, same tsvector work in both arms.';
  raise notice 'A large ratio means the cost is INDEX MAINTENANCE, so the fix is';
  raise notice 'a narrow side table populated by INSERT rather than UPDATEs here.';
  raise notice 'A small ratio refutes that and the design needs rethinking.';
end
$$;
