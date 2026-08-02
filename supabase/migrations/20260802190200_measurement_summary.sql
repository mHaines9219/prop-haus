-- ============================================================================
-- public.measurement_summary — the read path 20260802184000 needed and lacked.
--
-- THE GAP, found by tripping over it immediately
--
-- 184000 made measurements durable. It did not make them READABLE by the process
-- that takes them. `catalog` is not exposed to the Data API:
--
--   GET /rest/v1/measurements  (Accept-Profile: catalog)
--     406  PGRST106  "Only the following schemas are exposed: public, graphql_public"
--
-- Which is the same wall 20260802012000 hit and solved with public.catalog_items.
-- So "durable" was half a property: the row survives the process, and no process
-- without a Postgres connection could read it back. BOSS can verify through the
-- Management API; I cannot, and neither can any script in this repo.
--
-- WHY A PROJECTION RATHER THAN A VIEW OVER THE TABLE
--
-- The obvious fix is a view exposing catalog.measurements in `public`. That would
-- put the raw `plan` jsonb one grant away from the Data API, and a stored plan can
-- carry literal values from the statement it measured — for a keyword-search
-- measurement, user query text. BOSS made "not selectable by authenticated" a
-- hard condition precisely because of that.
--
-- So this returns the NUMBERS and never the plan. The literal-bearing column
-- cannot cross the Data API boundary at all, rather than being protected by a
-- grant somebody might widen later while trying to fix a confusing 403 — which is
-- exactly the failure mode Honey pinned a test against on public.projects.
--
-- Fields chosen to answer the questions that have actually cost pushes today:
-- buffers and buffers/row (the load-bearing unit), the child node type and index
-- name (Index Scan vs Seq Scan, settled later without re-running), and ms as
-- context only.
-- ============================================================================

begin;

create or replace function public.measurement_summary(p_migration text)
returns table (
  rows_touched    int,
  buffers         bigint,
  buffers_per_row numeric,
  node            text,
  child           text,
  index_used      text,
  ms              numeric,
  recorded_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.rows_touched,
    (m.plan->0->'Plan'->>'Shared Hit Blocks')::bigint
      + (m.plan->0->'Plan'->>'Shared Read Blocks')::bigint,
    round((((m.plan->0->'Plan'->>'Shared Hit Blocks')::bigint
      + (m.plan->0->'Plan'->>'Shared Read Blocks')::bigint))::numeric
      / greatest(m.rows_touched, 1), 1),
    m.plan->0->'Plan'->>'Node Type',
    m.plan->0->'Plan'->'Plans'->0->>'Node Type',
    m.plan->0->'Plan'->'Plans'->0->>'Index Name',
    round((m.plan->0->>'Execution Time')::numeric, 1),
    m.recorded_at
  from catalog.measurements m
  where m.migration = p_migration
  order by m.rows_touched
$$;

comment on function public.measurement_summary(text) is
  'Read-back for catalog.measurements over the Data API, which cannot see the catalog schema. Returns the derived NUMBERS and deliberately never the raw plan jsonb -- a stored plan can contain literal values from the statement it measured. service_role only.';

-- Deny by default, then grant the one role that should have it. `public` is
-- revoked explicitly: functions are executable by PUBLIC by default, which is how
-- 20260802020000 ended up anon-callable and burning a statement timeout per call.
revoke all on function public.measurement_summary(text) from public;
grant execute on function public.measurement_summary(text) to service_role;

commit;
