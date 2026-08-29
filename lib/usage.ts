/**
 * Metered usage — the counters behind the AI search paywall.
 *
 * Backed by Postgres `public.usage_counters`
 * (supabase/migrations/20260627181123_init_accounts.sql), which is
 * SERVER-WRITTEN ONLY — its RLS grants revoke insert/update/delete from
 * authenticated and anon entirely. Every read and write here goes through the
 * service-role client (lib/supabase/admin.ts) for that reason; there is no
 * client-reachable path that could self-grant usage.
 *
 * WHY THE INCREMENT IS AN RPC, NOT A READ-MODIFY-WRITE
 * `increment_usage_counter` (supabase/migrations/20260829120000_usage_counter_daily_rpc.sql)
 * does the upsert atomically in one statement:
 *   insert ... on conflict (org_id, period, metric) do update set count = count + 1
 * That is what makes concurrent requests from the same org count correctly —
 * a select-then-update from this module could lose one of two simultaneous
 * increments, which is a free search, the one thing a paywall exists to
 * prevent.
 *
 * WHAT IS COUNTED, AND WHY UP RATHER THAN DOWN
 * We store usage (a count that only rises) rather than remaining allowance (a
 * count that falls). lib/plans.ts explains the reasoning: changing
 * `aiSearchesPerDay` from 5 to 10 is a one-line edit with no backfill, because
 * nothing on disk encodes the limit. The limit is applied at read time,
 * against whatever plans.ts says today.
 */
import { createAdminClient } from './supabase/admin';
import type { PlanTier } from './accounts';
import { limitFor, remaining as remainingFor, usagePeriod, type MeteredMetric } from './plans';

/** What a gate needs to decide, and what the UI needs to render "3 of 5 left". */
export type Allowance = {
  metric: MeteredMetric;
  period: string;
  /** Searches already consumed in this period. */
  used: number;
  /** The plan's ceiling, or null when unlimited. */
  limit: number | null;
  /** Searches left, or null when unlimited. Never negative. */
  remaining: number | null;
  /** False only when a real limit exists and it has been reached. */
  allowed: boolean;
};

function toAllowance(
  plan: PlanTier,
  metric: MeteredMetric,
  period: string,
  used: number,
): Allowance {
  const limit = limitFor(plan, metric);
  return {
    metric,
    period,
    used,
    limit,
    remaining: remainingFor(plan, metric, used),
    allowed: limit === null || used < limit,
  };
}

/** Current standing for one metric. Read-only — checking never consumes. */
export async function getAllowance(
  orgId: string,
  plan: PlanTier,
  metric: MeteredMetric,
  now = new Date(),
): Promise<Allowance> {
  const period = usagePeriod(metric, now);
  const { data, error } = await createAdminClient()
    .from('usage_counters')
    .select('count')
    .eq('org_id', orgId)
    .eq('period', period)
    .eq('metric', metric)
    .maybeSingle();
  if (error) throw error;
  return toAllowance(plan, metric, period, (data?.count as number | undefined) ?? 0);
}

/**
 * Consume one unit and return the standing AFTER the increment.
 *
 * Callers gate with getAllowance() first and call this only once the billable
 * work actually succeeded — see the note in app/api/search/route.ts on why a
 * request that returned nothing is not charged.
 */
export async function recordUsage(
  orgId: string,
  plan: PlanTier,
  metric: MeteredMetric,
  now = new Date(),
): Promise<Allowance> {
  const period = usagePeriod(metric, now);
  const { data, error } = await createAdminClient().rpc('increment_usage_counter', {
    p_org_id: orgId,
    p_period: period,
    p_metric: metric,
  });
  if (error) throw error;
  return toAllowance(plan, metric, period, data as number);
}

/**
 * Every metered metric for one org, for the usage endpoint and the search UI.
 */
export async function usageSnapshot(
  orgId: string,
  plan: PlanTier,
  now = new Date(),
): Promise<Record<MeteredMetric, Allowance>> {
  const [visionSearches, aiSearchesPerDay] = await Promise.all([
    getAllowance(orgId, plan, 'visionSearches', now),
    getAllowance(orgId, plan, 'aiSearchesPerDay', now),
  ]);
  return { visionSearches, aiSearchesPerDay };
}
