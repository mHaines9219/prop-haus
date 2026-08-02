-- ============================================================================
-- MEASUREMENT — creates nothing, drops nothing. WRITES UP TO 250 ROWS.
-- Second of three; see 20260802170200 for the first and for why a measurement
-- arrives here as a migration.
--
-- WHAT IT WRITES, corrected. The original header said "changes no stored value"
-- and that was false in the same way 20260802170200's was. Both statements below
-- select rows where keyword_tsv IS NULL and assign the column to itself; the
-- BEFORE UPDATE trigger then computes a real tsvector. So up to 250 rows go
-- null -> populated, permanently.
--
-- Those writes are forward progress — byte-identical to what the backfill would
-- have written — so this is harmless. It is corrected anyway because the same
-- untrue sentence appeared in three measurement files, which makes it a template
-- rather than a slip, and the reader it misleads is whoever greps for "which
-- migrations write to prop_items".
--
-- WHAT 170200 ESTABLISHED, AND WHAT IT LEFT OPEN
--
-- A single-row update of catalog.prop_items costs ~189ms of server time even
-- when it is HOT-eligible and therefore maintains no index at all. Index
-- maintenance adds 2x on top of that, which refuted my hypothesis: I needed
-- ~1,600x to explain the gap against a scratch cluster that did 0.09ms/row.
--
-- So the cost is not index maintenance and it is not the tsvector computation
-- either — scratch ran the identical trigger over the identical catalog text at
-- 0.09ms/row, which rules the computation out by measurement rather than by
-- argument. What is left is I/O: fetching each row's pages and TOAST chunks.
--
-- THE QUESTION THIS ANSWERS
--
-- Every number I have is from PER-ROW work. The chunk function uses
-- `where id in (select id ... limit N)`, which is N separate row lookups, and
-- 170200 timed ten individual single-row statements.
--
-- Bulk set-based work amortises I/O in a way per-row work cannot: one range scan
-- reading pages in physical order instead of N random lookups, one plan, one
-- pass. If that is where the cost goes, a set-based range chunk will be
-- dramatically cheaper per row than 189ms.
--
--   Bulk near ~5ms/row     -> larger set-based range chunks; the backfill is
--                             minutes, and the design question is closed.
--   Bulk also ~150ms/row   -> amortisation does not help, no SQL shape fixes
--                             this, and the remaining options are the bulk
--                             COPY + swap_in_staging path (blocked on the
--                             database password) or a larger instance.
--
-- WHY TWO SIZES RATHER THAN ONE
--
-- One size gives a rate; two give a TREND, and the trend is the actual question.
-- If per-row cost falls from 50 rows to 200 rows, that is amortisation visible
-- in the data. If it is flat, there is nothing to amortise and the per-row floor
-- is real.
--
-- BLAST RADIUS
--
-- 250 rows total, 0.27% of the table, in two bounded statements. The incident
-- was a full-table rewrite of 90,953 rows held open for fifteen minutes.
--
-- THE GUARD BELOW DOES NOTHING, and this is the correction that matters most in
-- this file. When it ran it emitted:
--
--   WARNING (25P01): SET LOCAL can only be used in transaction blocks
--
-- Migrations here do NOT run inside a transaction, so SET LOCAL is a no-op —
-- every one in this repo's history has been, including the '15min' in #46 that
-- was described in channel as bounding the backfill. It bounded nothing.
--
-- The original paragraph here argued the timeout was "sized so the pessimistic
-- case still completes and REPORTS". That protection was never present. The run
-- finished in 20.2s so no harm landed, but the paragraph read as a safeguard and
-- the next person sizing a bounded operation would have copied it.
--
-- The statement is kept rather than deleted, because the WARNING it produces is
-- the evidence for the finding.
-- ============================================================================

-- NO-OP. Kept as the evidence for the WARNING described above; migrations here
-- are not transactional, so this sets nothing. Do not copy it as a guard.
set local statement_timeout = '90s';

do $$
declare
  lo       text;
  hi       text;
  t0       timestamptz;
  ms       numeric;
  n        int;
  rate_50  numeric;
  rate_200 numeric;
begin
  -- ---------------------------------------------------------------------------
  -- Step 1 — 50 rows as ONE set-based statement over a contiguous id range.
  -- The range predicate is what makes this a range scan rather than 50 lookups.
  -- ---------------------------------------------------------------------------
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit 50) s;

  if lo is null then
    raise exception 'no unpopulated rows left to measure';
  end if;

  t0 := clock_timestamp();
  update catalog.prop_items p set keyword_tsv = p.keyword_tsv
   where p.id between lo and hi and p.keyword_tsv is null;
  get diagnostics n = row_count;
  ms := extract(epoch from (clock_timestamp() - t0)) * 1000;
  rate_50 := ms / greatest(n, 1);
  raise notice 'set-based  % rows  % ms  -> % ms/row', n, round(ms, 1), round(rate_50, 2);

  -- ---------------------------------------------------------------------------
  -- Step 2 — 200 rows, same shape. Four times the work in one statement.
  -- ---------------------------------------------------------------------------
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit 200) s;

  t0 := clock_timestamp();
  update catalog.prop_items p set keyword_tsv = p.keyword_tsv
   where p.id between lo and hi and p.keyword_tsv is null;
  get diagnostics n = row_count;
  ms := extract(epoch from (clock_timestamp() - t0)) * 1000;
  rate_200 := ms / greatest(n, 1);
  raise notice 'set-based  % rows  % ms  -> % ms/row', n, round(ms, 1), round(rate_200, 2);

  raise notice '----------------------------------------------------------------';
  raise notice 'per-row baseline (170200, HOT)          188.90 ms/row';
  raise notice 'per-row baseline (170200, not HOT)      384.00 ms/row';
  raise notice 'set-based 50                            % ms/row', round(rate_50, 2);
  raise notice 'set-based 200                           % ms/row', round(rate_200, 2);
  raise notice 'projected full backfill at the 200 rate % minutes',
    round((rate_200 * 90953) / 60000, 1);
  raise notice '----------------------------------------------------------------';
end
$$;
