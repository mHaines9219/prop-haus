-- ============================================================================
-- MEASUREMENT — the buffer ladder. WRITES UP TO 2,250 ROWS (50 + 200 + 2000).
--
-- Fourth and last diagnostic on the in-place UPDATE path. It must run BEFORE
-- 20260802190000, which drops catalog.prop_items.keyword_tsv — after that this
-- file has nothing left to measure. That ordering is the reason for the 183000
-- timestamp rather than a later one.
--
-- WHAT IT WRITES, up front, because the last three files got this line wrong
--
-- EXPLAIN ANALYZE EXECUTES the statement. Three arms of 50, 200 and 2000 rows
-- take up to 2,250 rows from keyword_tsv null -> populated, permanently. That is
-- forward progress on the backfill, not a no-op, and it is not reverted by
-- 190000 dropping the column — the rows are simply discarded with it.
--
-- WHY BUFFERS AND NOT MILLISECONDS
--
-- Three measurements of the same 200-row statement exist:
--
--   20260802181000 step 2       200 rows   11,217 ms   (buffers not captured)
--   20260802182000 before       200 rows   21,716 ms   155,405 buffers
--   20260802182000 after        200 rows   33,399 ms   163,282 buffers
--
-- Wall clock spans 3.0x on identical work. Buffers span 1.05x. A page-access
-- counter does not care about cache temperature or what else the instance is
-- doing, which is exactly why it held still while the stopwatch did not.
--
-- That 3x band destroys any fit built on timing. Pairing the 50-row timing with
-- each of the three 200-row timings in turn gives:
--
--   200-row point = 11,217 ms  ->  marginal  14.97 ms/row   fixed  8,223 ms
--   200-row point = 21,716 ms  ->  marginal  84.96 ms/row   fixed  4,723 ms
--   200-row point = 33,399 ms  ->  marginal 162.85 ms/row   fixed    829 ms
--
-- Same arithmetic, three samples of the same statement, and the conclusion
-- FLIPS SIGN: the first says cost is mostly fixed per statement and chunk size
-- is the dominant lever; the third says cost is essentially pure per-row and
-- chunk size barely matters. An estimate whose sign depends on which sample you
-- happened to draw carries no information. The 8,224 ms "fixed cost" in
-- 20260802182000's header is withdrawn on those grounds, and so is every
-- wall-clock projection built on it — including the 85-minute figure.
--
-- WHAT THIS MEASURES, PRE-REGISTERED SO IT CANNOT BE FITTED AFTERWARDS
--
-- Two hypotheses, normalised at the one point already measured (155,405 buffers
-- for 200 rows = 777 buffers/row):
--
--   rows    LINEAR (777/row)    FLAT (fixed 155,405)    discrimination
--     50          38,851               155,405              4.0x
--    200         155,405               155,405              1.0x
--   2000       1,554,050               155,405             10.0x
--
-- The 200-row row is the ANCHOR, not corroboration. Both hypotheses agree there
-- by construction, so it discriminates at 1.0x and carries no evidence about
-- which is true. One point cannot distinguish a line through the origin from a
-- horizontal line; it can only fix the constant. Saying the measured 200-row
-- point "fits the linear prediction almost exactly" was circular and is struck.
--
-- 2000 rows discriminates at 10x, 50 rows at 4x, and running all three in ONE
-- session puts them under one cache state — removing the cross-session confound
-- that made the timing samples useless in the first place.
--
-- LINEAR  => cost is per-row index maintenance, chunk size is not a lever, and
--            the side table is chosen on buffer accounting alone.
-- FLAT    => a real and large fixed per-statement cost exists, and the chunk
--            parameter is worth tuning wherever chunked writes remain.
--
-- Either way, 2000 is also the chunk size already hard-coded as a default in
-- catalog.backfill_keyword_tsv_chunk() and in scripts/backfill-keyword-tsv.ts,
-- picked as a round number and never measured. This gives it a number.
--
-- WHAT IT DOES NOT DECIDE
--
-- Not the side table. 760 buffers/row across twelve indexes is measured, not
-- fitted, and a narrow two-column relation with one GIN index avoids those
-- buffers by construction. No outcome here reopens 20260802190000.
--
-- ON THE TIMEOUT, WHICH IS A REPAIR AND NOT A COPY
--
-- 20260802181000 emitted `WARNING 25P01: SET LOCAL can only be used in
-- transaction blocks`, so every `set local statement_timeout` in this repo has
-- been a no-op, including the '15min' in #46 that was described as bounding the
-- backfill. The repair is a plain SET, which is session-scoped and takes effect
-- outside a transaction. Two consequences worth stating rather than discovering:
--
--   * It persists for the rest of the connection, so it is reset at the bottom
--     of this file. If an arm fails before that reset, the raised timeout leaks
--     into whatever migration `db push` runs next on the same connection.
--   * Each arm is its own DO block, hence its own statement, hence separately
--     bounded and separately committed. That is the reason for the repetition
--     below: one block covering all three would be a single statement, so the
--     timeout could not bound an arm and a failure in the third would discard
--     nothing but would report nothing either.
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
