-- AI search allowances now reset per plan: ISO week on Browse and Directory,
-- UTC day on Coordinator (lib/plans.ts windowFor). The metric key is
-- 'aiSearches'; its period is 'YYYY-Www' or 'YYYY-MM-DD'. Rows under the old
-- 'aiSearchesPerDay' key are left in place as history and are no longer read,
-- so every org starts the new window at zero.
comment on column public.usage_counters.metric is
  '''visionSearches'' | ''aiSearches''';
comment on column public.usage_counters.period is
  '''lifetime'' for visionSearches; ''YYYY-Www'' (ISO week) or ''YYYY-MM-DD'' for aiSearches, by plan';
