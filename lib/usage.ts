/**
 * Metered usage — the counters behind the AI search paywall.
 *
 * WHAT IS COUNTED, AND WHY UP RATHER THAN DOWN
 * We store usage (a count that only rises) rather than remaining allowance (a
 * count that falls). lib/plans.ts explains the reasoning and this module is the
 * implementation of it: changing `aiSearchesPerMonth` from 20 to 5 is a one-line
 * edit with no backfill, because nothing on disk encodes the limit. The limit is
 * applied at read time, against whatever plans.ts says today.
 *
 * SHAPE MATCHES THE TABLE, DELIBERATELY
 * Rows are keyed `(orgId, period, metric)` — the exact primary key of
 * `public.usage_counters` in supabase/migrations/20260627181123_init_accounts.sql.
 * `period` comes from usagePeriod(): 'lifetime' for the vision trial, 'YYYY-MM'
 * for the monthly text allowance. When the Postgres port lands, readRows/writeRows
 * become a select and an upsert and nothing above them changes.
 *
 * WHY A FILE AND NOT SUPABASE TODAY
 * `usage_counters.org_id` is `not null references public.organizations(id)`, and
 * the placeholder org in lib/session.ts is not a real row — a service-role insert
 * would fail the foreign key. This mirrors lib/projects.ts (same file-backed
 * placeholder, same reason) so both stores port at the same time, with auth.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PlanTier } from './accounts';
import { limitFor, remaining as remainingFor, usagePeriod, type MeteredMetric } from './plans';

/** One `usage_counters` row. */
type UsageRow = {
  orgId: string;
  period: string;
  metric: MeteredMetric;
  count: number;
  updatedAt: string;
};

/** What a gate needs to decide, and what the UI needs to render "3 of 20 left". */
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

const FILE = path.join(process.cwd(), 'data', 'usage.json');

async function readRows(): Promise<UsageRow[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as UsageRow[];
  } catch {
    return [];
  }
}

async function writeRows(rows: UsageRow[]) {
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

/**
 * Serializes read-modify-write on the counter file.
 *
 * A lost update here is not a cosmetic bug — it is a free search, which is the
 * one thing a paywall exists to prevent. This closes the window within a single
 * Node process; it does NOT close it across processes or serverless instances.
 * That guarantee needs the database, where the upsert is atomic:
 *   insert ... on conflict (org_id, period, metric) do update set count = count + 1
 * Until then the limit is soft under genuine concurrency, and that is a known,
 * bounded overrun rather than an unbounded one.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // Keep the chain alive even if `run` rejects, so one failure cannot wedge it.
  queue = run.catch(() => undefined);
  return run;
}

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
  const rows = await readRows();
  const row = rows.find((r) => r.orgId === orgId && r.period === period && r.metric === metric);
  return toAllowance(plan, metric, period, row?.count ?? 0);
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
  return serialized(async () => {
    const rows = await readRows();
    const row = rows.find((r) => r.orgId === orgId && r.period === period && r.metric === metric);
    const count = (row?.count ?? 0) + 1;
    if (row) {
      row.count = count;
      row.updatedAt = now.toISOString();
    } else {
      rows.push({ orgId, period, metric, count, updatedAt: now.toISOString() });
    }
    await writeRows(rows);
    return toAllowance(plan, metric, period, count);
  });
}

/**
 * Every metered metric for one org, for the usage endpoint and the search UI.
 */
export async function usageSnapshot(
  orgId: string,
  plan: PlanTier,
  now = new Date(),
): Promise<Record<MeteredMetric, Allowance>> {
  const [visionSearches, aiSearchesPerMonth] = await Promise.all([
    getAllowance(orgId, plan, 'visionSearches', now),
    getAllowance(orgId, plan, 'aiSearchesPerMonth', now),
  ]);
  return { visionSearches, aiSearchesPerMonth };
}
