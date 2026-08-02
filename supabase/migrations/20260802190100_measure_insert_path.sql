-- ============================================================================
-- THE GATE. Buffers/row for an INSERT into catalog.prop_item_keywords.
--
-- This is the measurement the entire side-table design turns on, and the first
-- one recorded durably instead of printed — see 20260802184000 for why.
--
-- WRITES UP TO 2,250 ROWS, and unlike the in-place ladder these are FORWARD
-- PROGRESS: the rows land in prop_item_keywords and the backfill will skip them.
--
-- THE PRE-REGISTERED THRESHOLD, stated before the run
--
-- In-place cost is 656-815 buffers/row, replicated at three scales across two
-- independent runs (20260802183000 and 20260802183100). The side table exists
-- because a narrow relation with ONE GIN index should not pay the ~11 index
-- entries per row version that catalog.prop_items does.
--
--   single-digit to low-tens buffers/row  ->  the design holds, proceed to the
--                                             backfill loop
--   hundreds of buffers/row               ->  THE SIDE TABLE IS WRONG. It moves
--                                             the cost instead of removing it,
--                                             and everything stops here.
--
-- That threshold was published before this file existed and it is not being
-- adjusted after the fact.
--
-- PRE-REGISTERED COST, per the rule that came out of the last run
--
-- The n=2000 rung of the in-place ladder ran 165 seconds and was foreseeable
-- from the n=200 rate. So, both branches priced in advance:
--
--   if the prediction holds (~10-30 buffers/row): ~2,250 rows x ~20 = ~45,000
--     buffers total across three rungs, low single-digit seconds.
--   if the prediction FAILS and this behaves like the wide table (~800/row): the
--     2000 rung alone is ~1.6M buffers and could take ~165 seconds.
--
-- ~165s is therefore the stated worst case. It is accepted rather than reduced,
-- because that branch is also the one that stops the project, and learning it
-- from 2,000 rows is far cheaper than learning it from 90,953.
--
-- WHY THREE RUNGS RATHER THAN ONE
--
-- Same reason Bumble designed the in-place ladder that way: one point gives a
-- rate, three give a shape, and the shape is what says whether the number holds
-- at the chunk size the loop will actually use. The loop's chunk is 2000 and it
-- was picked as a round number, so the top rung prices exactly what will run.
--
-- Each rung is its own statement, so a failure at 2000 still records 50 and 200.
-- ============================================================================

-- Plain SET, not SET LOCAL: migrations here are not transactional, and SET LOCAL
-- outside a transaction block silently does nothing (WARNING 25P01).
set statement_timeout = '15min';

-- ---------------------------------------------------------------------------
-- Rung 1 — 50 rows.
-- ---------------------------------------------------------------------------
do $$
declare
  n constant int := 50;
  p jsonb;
begin
  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'insert into catalog.prop_item_keywords (id, keyword_tsv) '
    || 'select i.id, catalog.keyword_vector(i) from catalog.prop_items i '
    || 'where i.id > coalesce((select max(k.id) from catalog.prop_item_keywords k), '''') '
    || 'order by i.id limit %s on conflict (id) do nothing', n)
  into p;

  insert into catalog.measurements (migration, label, rows_touched, plan)
  values ('20260802190100', 'insert_into_side_table', n, p);
end
$$;

-- ---------------------------------------------------------------------------
-- Rung 2 — 200 rows.
-- ---------------------------------------------------------------------------
do $$
declare
  n constant int := 200;
  p jsonb;
begin
  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'insert into catalog.prop_item_keywords (id, keyword_tsv) '
    || 'select i.id, catalog.keyword_vector(i) from catalog.prop_items i '
    || 'where i.id > coalesce((select max(k.id) from catalog.prop_item_keywords k), '''') '
    || 'order by i.id limit %s on conflict (id) do nothing', n)
  into p;

  insert into catalog.measurements (migration, label, rows_touched, plan)
  values ('20260802190100', 'insert_into_side_table', n, p);
end
$$;

-- ---------------------------------------------------------------------------
-- Rung 3 — 2000 rows. The chunk size the backfill loop actually uses.
-- ---------------------------------------------------------------------------
do $$
declare
  n constant int := 2000;
  p jsonb;
begin
  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'insert into catalog.prop_item_keywords (id, keyword_tsv) '
    || 'select i.id, catalog.keyword_vector(i) from catalog.prop_items i '
    || 'where i.id > coalesce((select max(k.id) from catalog.prop_item_keywords k), '''') '
    || 'order by i.id limit %s on conflict (id) do nothing', n)
  into p;

  insert into catalog.measurements (migration, label, rows_touched, plan)
  values ('20260802190100', 'insert_into_side_table', n, p);
end
$$;

reset statement_timeout;

-- ---------------------------------------------------------------------------
-- The result is now a query, not a message. Read it with:
--
--   select rows_touched,
--          (plan->0->'Plan'->>'Shared Hit Blocks')::bigint
--            + (plan->0->'Plan'->>'Shared Read Blocks')::bigint as buffers,
--          round((((plan->0->'Plan'->>'Shared Hit Blocks')::bigint
--            + (plan->0->'Plan'->>'Shared Read Blocks')::bigint))::numeric
--            / rows_touched, 1)                                 as buffers_per_row
--     from catalog.measurements
--    where migration = '20260802190100'
--    order by rows_touched;
--
-- Which means anyone can check this number, including through the Management
-- API, without inheriting it from whatever post reports it.
-- ---------------------------------------------------------------------------
