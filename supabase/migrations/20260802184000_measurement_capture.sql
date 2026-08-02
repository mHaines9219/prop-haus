-- ============================================================================
-- catalog.measurements — so a number survives the process that took it.
--
-- Adapted from Honey's pattern (OUTBOX/PROP_HAUS_DURABLE_MEASUREMENT_CAPTURE.sql),
-- which they verified end to end on a scratch PostgreSQL 14 cluster.
--
-- WHY THIS EXISTS, from today rather than in principle
--
-- 20260802183000 applied successfully and its buffer counts were lost. They were
-- emitted as RAISE NOTICE, which lives only on the stderr of whichever process
-- ran `db push` — Honey confirmed on scratch that nothing in the database
-- retains it afterwards. That cost a second push (20260802183100) to re-run a
-- byte-identical file.
--
-- The re-run turned out to be worth more than the attestation it was for: the
-- two runs DISAGREED on the per-row rate (656 vs 815 buffers/row) and on the
-- direction of curvature, which killed a finding before it was published. But
-- that was luck. Had the first run's numbers been in a table, the second push
-- would have been a `select`.
--
-- It is also the attestation problem in miniature, which is the deeper reason
-- BOSS ruled it rather than leaving it optional. A number on one process's
-- stdout can only ever be vouched for by that process. A number in a table can
-- be read by anyone — including through the Management API — without inheriting
-- a figure from a message.
--
-- WHAT IT BUYS BEYOND SURVIVAL
--
-- Storing the whole plan rather than a printed summary means every by-hand plan
-- reading done today becomes a query later, with no further push against live:
--
--   * Was the child node still an Index Scan at 2000 rows, or did it flip?
--   * What did the trigger cost per row? (the 0.52 ms/row figure)
--   * Which index did it actually use?
--
-- All of that is in the JSON. None of it was in the notices.
--
-- WHY ITS OWN MIGRATION
--
-- BOSS's condition, and the reason is drift: if each measurement file created
-- this table inline, two files could disagree about its shape and the history
-- would not say which won.
-- ============================================================================

-- Wrapped explicitly. Migrations in this repo do NOT run inside a transaction --
-- 20260802181000 emitted `WARNING 25P01: SET LOCAL can only be used in
-- transaction blocks`, and Honey then proved the mechanism on scratch: inside a
-- real implicit block Postgres stays silent, so the warning is positive evidence
-- of statement-at-a-time execution rather than merely consistent with it.
--
-- Without this wrap, a failure after the CREATE but before the REVOKE would
-- leave the table in place with default privileges. That is precisely the shape
-- Honey reproduced on 20260802180000, where an abort between `revoke` and
-- `grant` left every owner surface unreadable.
begin;

create table if not exists catalog.measurements (
  id           bigserial   primary key,
  migration    text        not null,   -- which file produced the row
  label        text        not null,   -- which experiment within it
  rows_touched int         not null,
  plan         jsonb       not null,   -- EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  recorded_at  timestamptz not null default now()
);

comment on table catalog.measurements is
  'Durable capture of EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output from measurement migrations. Exists because 20260802183000''s buffer counts were emitted as RAISE NOTICE and lost with the process that ran it. NOT readable by anon or authenticated: a stored plan can contain literal values from the statement it measured, including user query text.';

comment on column catalog.measurements.plan is
  'The whole plan, not a summary. Node type, child node, index name, buffer counts and trigger accounting are all recoverable later without re-running against live.';

create index if not exists measurements_migration_idx
  on catalog.measurements (migration, rows_touched);

-- ---------------------------------------------------------------------------
-- Grants. THIS IS THE SECURITY-RELEVANT PART, and it is a hard condition of
-- BOSS's ruling rather than hygiene.
--
-- A stored plan can carry literal values from the statement it measured. For a
-- keyword-search measurement those literals are user query text, and for a
-- backfill they are row ids. So this table is service_role and catalog_writer
-- only.
--
-- Deny first, then grant the two roles that should have it. Revoking from
-- `public` explicitly matters: new tables are not readable by PUBLIC by default,
-- but 20260802020000 taught this project that assuming a default is how an
-- anon-callable function ends up burning a statement timeout. Belt and braces on
-- the one table whose contents are least predictable.
--
-- RLS is enabled with NO policy, which is the same construction
-- prop_items_staging uses: no policy means no rows for anon/authenticated even
-- if a grant is ever added by mistake. Two independent barriers.
-- ---------------------------------------------------------------------------
alter table catalog.measurements enable row level security;

revoke all on catalog.measurements               from public;
revoke all on catalog.measurements               from anon, authenticated;
revoke all on sequence catalog.measurements_id_seq from public, anon, authenticated;

grant select, insert on catalog.measurements to service_role, catalog_writer;
grant usage on sequence catalog.measurements_id_seq to service_role, catalog_writer;

alter table catalog.measurements owner to catalog_writer;

commit;

-- ---------------------------------------------------------------------------
-- READ-BACK QUERIES, kept here as documentation rather than executed.
--
-- These are the point of the table: each one replaces a by-hand plan reading
-- that previously cost a push against live. Honey wrote them; they are recorded
-- verbatim so the next person does not have to rediscover the JSON paths.
--
--   -- buffers and buffers/row, the load-bearing unit per BOSS's ruling.
--   -- Buffer counts at the top Plan node are cumulative over children, so this
--   -- is the statement total and does not need summing across nodes.
--   select rows_touched,
--          (plan->0->'Plan'->>'Shared Hit Blocks')::bigint
--            + (plan->0->'Plan'->>'Shared Read Blocks')::bigint as buffers,
--          round((((plan->0->'Plan'->>'Shared Hit Blocks')::bigint
--            + (plan->0->'Plan'->>'Shared Read Blocks')::bigint))::numeric
--            / rows_touched, 1)                                 as buffers_per_row,
--          round((plan->0->>'Execution Time')::numeric, 1)       as ms  -- context only
--     from catalog.measurements where migration = '<version>' order by rows_touched;
--
--   -- plan shape, later, without re-running: Index Scan vs Seq Scan.
--   select rows_touched,
--          plan->0->'Plan'->>'Node Type'             as node,
--          plan->0->'Plan'->'Plans'->0->>'Node Type' as child,
--          plan->0->'Plan'->'Plans'->0->>'Index Name' as index_used
--     from catalog.measurements where migration = '<version>' order by rows_touched;
--
--   -- trigger accounting: the 0.52 ms/row figure, recoverable.
--   select rows_touched,
--          plan->0->'Triggers'->0->>'Trigger Name'                        as trigger_name,
--          (plan->0->'Triggers'->0->>'Calls')::int                        as calls,
--          round((plan->0->'Triggers'->0->>'Time')::numeric, 1)           as trigger_ms,
--          round((plan->0->'Triggers'->0->>'Time')::numeric
--                / nullif((plan->0->'Triggers'->0->>'Calls')::int, 0), 3) as ms_per_row
--     from catalog.measurements where migration = '<version>' order by rows_touched;
--
-- CAVEATS, carried over from Honey and worth keeping attached to the schema
--
--  * EXPLAIN ANALYZE EXECUTES the statement. Measurement files using this table
--    are not dry runs, and their writes are real.
--  * The insert is itself a write and belongs inside the APPLYING/APPLIED
--    bracket of whatever run produces it.
--  * Honey verified the pattern on PostgreSQL 14; live is 15+. The JSON plan
--    keys used above are stable across those, but that was not verified on 15.
--    First read-back on live is the check.
-- ---------------------------------------------------------------------------
