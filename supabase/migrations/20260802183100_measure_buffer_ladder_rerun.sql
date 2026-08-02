-- ============================================================================
-- MEASUREMENT — re-run of 20260802183000. WRITES UP TO 2,250 ROWS.
--
-- WHY A RE-RUN RATHER THAN A NEW EXPERIMENT
--
-- 20260802183000 applied successfully — it is in schema_migrations. Its three
-- arms emitted their buffer counts as NOTICEs, and **I do not hold that output.**
-- The session that ran it and the session writing this cannot be shown to be the
-- same one, so quoting those counts would be exactly the inherited-number
-- problem this channel spent an hour eliminating: a figure with no one able to
-- say "I ran it."
--
-- So the arms below are a byte-identical copy of 20260802183000's. Not a
-- redesign, not an improvement — the same three statements, so the result is
-- directly comparable to the first run if that output ever surfaces, and
-- attestable either way.
--
-- Cost of re-running instead of hunting the log: 2,250 rows on a code path that
-- 20260802190000 discards anyway, and under a minute. Cost of quoting numbers I
-- cannot attest to: the thing we just spent an hour fixing.
--
-- WHAT IT MEASURES, and what it does NOT
--
-- Buffers, not milliseconds. Three samples of "200 rows" exist from earlier runs
-- and their wall-clock spans 3.0x (11,217 / 21,716 / 33,399 ms) while their
-- buffer counts span 1.05x (155,405 / 163,282). On this instance the stopwatch
-- carries no evidence and the page counter does. Timing is printed as context
-- only.
--
-- The question is whether the cost of an in-place UPDATE is linear in rows or
-- has a large fixed per-statement term:
--
--   rows    linear @777/row    flat @155k    discrimination
--     50          38,851         155,405          4.0x
--    200         155,405         155,405          1.0x   <- anchor, no information
--   2000       1,554,050         155,405         10.0x
--
-- The 200-row rung discriminates at 1.0x BY CONSTRUCTION — 777 buffers/row is
-- 155,405 / 200, so both hypotheses are normalised there. It is the anchor, not
-- corroboration, and an earlier version of this reasoning wrongly called it
-- "fits the linear prediction almost exactly." The 2000-row rung is where the
-- answer is.
--
-- WHAT IT DOES NOT BUY: forward progress. 20260802190000 drops
-- prop_items.keyword_tsv, so every row this populates is discarded. What it buys
-- is that 777 buffers/row is currently a SINGLE UNREPLICATED SAMPLE and the
-- entire rejection of the in-place path rests on it. Three points under one
-- cache state harden it or break it.
--
-- Three separate DO blocks rather than one, so each arm is its own statement:
-- separately committed, so a failure at 2000 still reports 50 and 200. That
-- matters here specifically because migrations in this repo are NOT
-- transactional (WARNING 25P01, proven on a scratch cluster by Honey), which is
-- also why the timeout below is a plain SET rather than SET LOCAL — SET LOCAL
-- outside a transaction block is a no-op and every one in this repo's history
-- has silently done nothing.
-- ============================================================================


set statement_timeout = '15min';

-- ---------------------------------------------------------------------------
-- Arm 1 — 50 rows. Predicts 38,851 buffers if linear, ~155,405 if flat.
-- ---------------------------------------------------------------------------
do $$
declare
  n           constant int := 50;
  lo          text;
  hi          text;
  plan        json;
  node        json;
  hit         bigint;
  rd          bigint;
  dirtied     bigint;
  touched     bigint;
  ms          numeric;
begin
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit n) s;

  if lo is null then
    raise notice 'LADDER n=% SKIPPED — no unpopulated rows left', n;
    return;
  end if;

  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'update catalog.prop_items p set keyword_tsv = p.keyword_tsv '
    || 'where p.id between %L and %L and p.keyword_tsv is null', lo, hi)
  into plan;

  node    := plan->0->'Plan';
  hit     := (node->>'Shared Hit Blocks')::bigint;
  rd      := (node->>'Shared Read Blocks')::bigint;
  dirtied := (node->>'Shared Dirtied Blocks')::bigint;
  ms      := (plan->0->>'Execution Time')::numeric;

  -- An UPDATE without RETURNING reports Actual Rows = 0 on the Update node —
  -- nothing is returned to the caller. The row count lives on its child scan.
  touched := coalesce((node->'Plans'->0->>'Actual Rows')::bigint, n);

  raise notice
    'LADDER n=% | node=% child=% | rows=% | buffers=% (hit=% read=% dirtied=%) | buffers/row=% | ms=%',
    n,
    node->>'Node Type',
    node->'Plans'->0->>'Node Type',
    touched,
    hit + rd,
    hit, rd, dirtied,
    round((hit + rd)::numeric / greatest(touched, 1), 1),
    round(ms, 1);
end
$$;

-- ---------------------------------------------------------------------------
-- Arm 2 — 200 rows. The anchor. Reproduces the one point already measured, in
-- this session's cache state, so the other two are comparable to it directly.
-- ---------------------------------------------------------------------------
do $$
declare
  n           constant int := 200;
  lo          text;
  hi          text;
  plan        json;
  node        json;
  hit         bigint;
  rd          bigint;
  dirtied     bigint;
  touched     bigint;
  ms          numeric;
begin
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit n) s;

  if lo is null then
    raise notice 'LADDER n=% SKIPPED — no unpopulated rows left', n;
    return;
  end if;

  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'update catalog.prop_items p set keyword_tsv = p.keyword_tsv '
    || 'where p.id between %L and %L and p.keyword_tsv is null', lo, hi)
  into plan;

  node    := plan->0->'Plan';
  hit     := (node->>'Shared Hit Blocks')::bigint;
  rd      := (node->>'Shared Read Blocks')::bigint;
  dirtied := (node->>'Shared Dirtied Blocks')::bigint;
  ms      := (plan->0->>'Execution Time')::numeric;
  touched := coalesce((node->'Plans'->0->>'Actual Rows')::bigint, n);

  raise notice
    'LADDER n=% | node=% child=% | rows=% | buffers=% (hit=% read=% dirtied=%) | buffers/row=% | ms=%',
    n,
    node->>'Node Type',
    node->'Plans'->0->>'Node Type',
    touched,
    hit + rd,
    hit, rd, dirtied,
    round((hit + rd)::numeric / greatest(touched, 1), 1),
    round(ms, 1);
end
$$;

-- ---------------------------------------------------------------------------
-- Arm 3 — 2000 rows. The 10x discriminator, and the chunk size already
-- defaulted to in catalog.backfill_keyword_tsv_chunk().
--
-- This is the expensive arm: ~1.55M buffer accesses if linear. It is bounded by
-- the 15min above, and if it is cancelled the two arms before it have already
-- reported and committed.
-- ---------------------------------------------------------------------------
do $$
declare
  n           constant int := 2000;
  lo          text;
  hi          text;
  plan        json;
  node        json;
  hit         bigint;
  rd          bigint;
  dirtied     bigint;
  touched     bigint;
  ms          numeric;
begin
  select min(id), max(id) into lo, hi
  from (select id from catalog.prop_items where keyword_tsv is null order by id limit n) s;

  if lo is null then
    raise notice 'LADDER n=% SKIPPED — no unpopulated rows left', n;
    return;
  end if;

  execute format(
    'explain (analyze, buffers, timing, format json) '
    || 'update catalog.prop_items p set keyword_tsv = p.keyword_tsv '
    || 'where p.id between %L and %L and p.keyword_tsv is null', lo, hi)
  into plan;

  node    := plan->0->'Plan';
  hit     := (node->>'Shared Hit Blocks')::bigint;
  rd      := (node->>'Shared Read Blocks')::bigint;
  dirtied := (node->>'Shared Dirtied Blocks')::bigint;
  ms      := (plan->0->>'Execution Time')::numeric;
  touched := coalesce((node->'Plans'->0->>'Actual Rows')::bigint, n);

  raise notice
    'LADDER n=% | node=% child=% | rows=% | buffers=% (hit=% read=% dirtied=%) | buffers/row=% | ms=%',
    n,
    node->>'Node Type',
    node->'Plans'->0->>'Node Type',
    touched,
    hit + rd,
    hit, rd, dirtied,
    round((hit + rd)::numeric / greatest(touched, 1), 1),
    round(ms, 1);
end
$$;

reset statement_timeout;
