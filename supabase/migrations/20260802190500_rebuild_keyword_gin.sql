-- ============================================================================
-- Rebuild the GIN index, now that prop_item_keywords is fully populated.
--
-- This is the second half of Honey's index-after trade. 20260802190400 dropped
-- prop_item_keywords_tsv_idx before the backfill loop; the loop has completed
-- (90,953 of 90,953 rows) and this builds the index in one sorted bulk pass.
--
-- WHAT THE LOOP MEASURED, over the complete 46-chunk set
--
--   chunks recorded    46          every chunk, no sampling
--   rows written       88,703      + 2,250 from the 20260802190100 gate = 90,953
--   total buffers      962,306
--   AMORTISED RATE     10.85 buffers/row
--   per-chunk spread   min 3.0 · median 10.6 · max 13.3
--
-- Against 656-815 buffers/row for the in-place UPDATE path, replicated across two
-- runs and three scales: a ~65x reduction, measured rather than projected.
--
-- AND THERE WERE NO FLUSH CHUNKS. That is a result, not luck.
--
-- Honey measured GIN's fastupdate pending list flushing onto roughly one chunk in
-- eleven, at 29-33 buffers/row against a ~5.6 baseline, and warned that a single
-- sample could land anywhere in that range. Zero chunks here exceeded even 2x the
-- amortised rate; the whole distribution sits between 3.0 and 13.3.
--
-- The mechanism is that 190400 had already dropped the GIN. No index means no
-- pending list, which means no periodic flush to land on. So dropping it first
-- did not merely halve the insert cost as Honey's arms predicted -- it removed the
-- variance entirely, which is a stronger version of their finding than their own
-- arms could show, because both of their arms measured a table that had an index
-- at some point in the run.
--
-- That also means the 10.85 figure is NOT comparable to Honey's 7.3 amortised or
-- to my own 14.8-15.8 gate readings. All three measure different configurations:
-- theirs synthetic text with an index present, the gate real text with the index
-- present, this real text with no index at all. Same direction, three different
-- experiments, and only this one describes what actually ran.
--
-- PRE-REGISTERED COST, and this one I genuinely cannot bound
--
-- Honey flagged it and I am carrying the flag rather than resolving it: EXPLAIN
-- does not cover DDL, and their pg_stat_database deltas came back 0 because the
-- collector is asynchronous. So a CREATE INDEX cannot be measured in buffers by
-- any instrument this project has. Their 230ms on synthetic PostgreSQL 14 is wall
-- clock, in the unit this channel spent the afternoon discrediting, over text with
-- different term diversity than the real catalog.
--
--   expected     seconds, on the strength of one synthetic data point
--   possible     tens of seconds -- 90,953 real tsvectors over twelve fields is
--                far more distinct lexemes than synthetic text
--   OVER THE 30-SECOND THRESHOLD IS PLAUSIBLE and is therefore stated here in
--   advance rather than reported afterwards
--
-- What bounds the risk instead of a number: it is ONE statement, it takes
-- ShareLock on a 90,953-row two-column table rather than the 890 MB wide one, it
-- is cancellable with no partial state, and nothing in production reads this index
-- yet -- the RPC that would use it does not exist on main. If it runs long the
-- correct response is to let it finish, because the alternative is a table with no
-- index and a port that needs one.
--
-- Measured after the fact by size and wall clock, both reported as what they are.
-- ============================================================================

begin;

create index if not exists prop_item_keywords_tsv_idx
  on catalog.prop_item_keywords using gin (keyword_tsv);

comment on index catalog.prop_item_keywords_tsv_idx is
  'Built in one bulk pass AFTER the backfill, per Honey''s index-after measurement: incremental GIN insertion leaves a permanently less compact index (11 MB vs 8.7 MB on their arms), which is a cost on every read rather than once. Do not re-create this index before a bulk load -- drop it, load, rebuild.';

commit;

-- ---------------------------------------------------------------------------
-- Verification queries, kept here rather than run inline, because a count that
-- gates nothing is better as a documented check than as a comment claiming it
-- passed. Read back with the service role:
--
--   -- completeness: must equal catalog.prop_items
--   select (select count(*) from catalog.prop_item_keywords) as keywords,
--          (select count(*) from catalog.prop_items)         as items;
--
--   -- no null vectors, which the NOT NULL constraint already guarantees but
--   -- which is worth confirming once against the real load
--   select count(*) from catalog.prop_item_keywords where keyword_tsv is null;
--
--   -- index size, the half of Honey's finding that persists
--   select pg_size_pretty(pg_relation_size('catalog.prop_item_keywords_tsv_idx'));
--
--   -- the amortised rate, from the complete chunk set
--   select sum((plan->0->'Plan'->>'Shared Hit Blocks')::bigint
--            + (plan->0->'Plan'->>'Shared Read Blocks')::bigint) as buffers,
--          sum(rows_touched)                                     as rows,
--          count(*)                                              as chunks
--     from catalog.measurements where migration = '20260802190400';
-- ---------------------------------------------------------------------------
