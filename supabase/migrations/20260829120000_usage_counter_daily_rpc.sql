-- ============================================================================
-- Daily AI-search allowance: usage_counters.metric moves from
-- 'aiSearchesPerMonth' to 'aiSearchesPerDay' (lib/plans.ts), and gets an
-- atomic increment so concurrent requests from the same org cannot both slip
-- through the paywall.
--
-- No data backfill: usage_counters has never been written in production —
-- lib/usage.ts counted against a local JSON file until now, so there are no
-- 'aiSearchesPerMonth' rows to rename.
--
-- WHY A FUNCTION INSTEAD OF A READ-MODIFY-WRITE FROM THE APP
-- `revoke insert, update, delete on public.usage_counters from authenticated,
-- anon` (20260627181123_init_accounts.sql) already forces every write through
-- the service role. This function does the upsert in one atomic statement —
-- `insert ... on conflict ... do update set count = count + 1` — so a lost
-- update under concurrency (two requests reading the same count, both writing
-- count+1) is impossible by construction rather than by app-level locking.
-- ============================================================================

comment on column public.usage_counters.metric is
  '''visionSearches'' | ''aiSearchesPerDay''';
comment on column public.usage_counters.period is
  '''lifetime'' for visionSearches, or ''YYYY-MM-DD'' for aiSearchesPerDay';

create or replace function public.increment_usage_counter(p_org_id uuid, p_period text, p_metric text)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (org_id, period, metric, count, updated_at)
  values (p_org_id, p_period, p_metric, 1, now())
  on conflict (org_id, period, metric)
  do update set count = public.usage_counters.count + 1, updated_at = now()
  returning count;
$$;

-- Server-written only, same invariant as the table itself: no client can call
-- this to forge or bypass its own usage.
revoke all on function public.increment_usage_counter(uuid, text, text) from public, anon, authenticated;
grant execute on function public.increment_usage_counter(uuid, text, text) to service_role;
