/**
 * Plan entitlements — the single source of truth for what each tier unlocks.
 *
 * Lives in CODE, not the database. The org stores only `plan: PlanTier`; changing
 * what a tier includes (or adding a tier) is a code change, never a migration.
 * Every gate routes through can() / withinLimit() / remaining() instead of
 * checking `plan === 'free'` inline.
 *
 * Metered allowances (visionSearches, aiSearchesPerDay) are counted in the
 * `usage_counters` table, which is SERVER-WRITTEN ONLY (service role). Storing
 * usage (count up) rather than "attempts left" (count down) means the limit can
 * change with no backfill, keeps full history, and can't be tampered with by a
 * client to bypass the paywall.
 */
import type { PlanTier } from './accounts';

export type Entitlements = {
  // capabilities (boolean)
  outreachAutomation: boolean;
  paperworkGeneration: boolean;
  consolidatedInvoicing: boolean;
  // metered allowances — counted in usage_counters; null = unlimited
  visionSearches: number | null; // LIFETIME trial for free users (moodboard/image search)
  aiSearchesPerDay: number | null; // resets daily (text search)
  // current-state limits — derived by counting rows; no counter needed
  activeProjects: number | null;
  vendorsPerProject: number | null;
  seats: number | null;
  savedItems: number | null;
};

export const PLAN_ENTITLEMENTS: Record<PlanTier, Entitlements> = {
  free: {
    // Free during MVP validation; gating comes later.
    outreachAutomation: true,
    paperworkGeneration: false,
    consolidatedInvoicing: false,
    visionSearches: 3, // 3 lifetime trial uses, then paywall
    aiSearchesPerDay: 5,
    activeProjects: 2,
    vendorsPerProject: 3,
    seats: 1,
    savedItems: 50,
  },
  pro: {
    outreachAutomation: true,
    paperworkGeneration: true,
    consolidatedInvoicing: true,
    visionSearches: null,
    aiSearchesPerDay: 10, // paid tier: 10/day, not unlimited — see lib/usage.ts
    activeProjects: null,
    vendorsPerProject: null,
    seats: 10,
    savedItems: null,
  },
};

// Keys split by value type so callers get type-safe gate checks.
type BooleanFeature = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];
type LimitMetric = {
  [K in keyof Entitlements]: Entitlements[K] extends number | null ? K : never;
}[keyof Entitlements];

/** Metered metrics need a usage_counter; this maps each to its reset window. */
export const METERED_METRICS = {
  visionSearches: 'lifetime',
  aiSearchesPerDay: 'daily',
} as const;
export type MeteredMetric = keyof typeof METERED_METRICS;

export function entitlementsFor(plan: PlanTier): Entitlements {
  return PLAN_ENTITLEMENTS[plan];
}

/** True if the plan unlocks a boolean capability. */
export function can(plan: PlanTier, feature: BooleanFeature): boolean {
  return PLAN_ENTITLEMENTS[plan][feature];
}

/** The numeric ceiling for a metric (null = unlimited). */
export function limitFor(plan: PlanTier, metric: LimitMetric): number | null {
  return PLAN_ENTITLEMENTS[plan][metric];
}

/** True if `current` usage is still under the plan's limit for `metric`. */
export function withinLimit(plan: PlanTier, metric: LimitMetric, current: number): boolean {
  const limit = PLAN_ENTITLEMENTS[plan][metric];
  return limit === null || current < limit;
}

/** Remaining allowance (null = unlimited; never negative). Use for "2 of 3 left" UI. */
export function remaining(plan: PlanTier, metric: LimitMetric, current: number): number | null {
  const limit = PLAN_ENTITLEMENTS[plan][metric];
  if (limit === null) return null;
  return Math.max(0, limit - current);
}

/** The usage_counters.period key for a metered metric ('lifetime' or 'YYYY-MM-DD'). */
export function usagePeriod(metric: MeteredMetric, now = new Date()): string {
  if (METERED_METRICS[metric] === 'lifetime') return 'lifetime';
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
