/**
 * Plan entitlements — the single source of truth for what each tier unlocks.
 *
 * Lives in CODE, not the database. The org stores only `plan: PlanTier`; changing
 * what a tier includes (or adding a tier) is a code change, never a migration.
 * Every gate routes through can() / withinLimit() / remaining() instead of
 * checking `plan === 'free'` inline.
 *
 * Metered allowances (visionSearches, aiSearches) are counted in the
 * `usage_counters` table, which is SERVER-WRITTEN ONLY (service role). Storing
 * usage (count up) rather than "attempts left" (count down) means the limit can
 * change with no backfill, keeps full history, and can't be tampered with by a
 * client to bypass the paywall.
 */
import type { PlanTier } from './accounts';

export type Entitlements = {
  // capabilities (boolean)
  /** Print which prop house holds a piece (name, link, "Courtesy of"). */
  vendorIdentity: boolean;
  outreachAutomation: boolean;
  paperworkGeneration: boolean;
  consolidatedInvoicing: boolean;
  // metered allowances — counted in usage_counters; null = unlimited
  visionSearches: number | null; // LIFETIME trial for free users (moodboard/image search)
  aiSearches: number | null; // text AI searches per window (below)
  /** How often aiSearches resets: 'week' on Browse and Directory, 'day' on Coordinator. */
  aiSearchWindow: 'day' | 'week';
  // current-state limits — derived by counting rows; no counter needed
  activeProjects: number | null;
  vendorsPerProject: number | null;
  seats: number | null;
  savedItems: number | null;
};

export const PLAN_ENTITLEMENTS: Record<PlanTier, Entitlements> = {
  free: {
    // Free during MVP validation; gating comes later.
    vendorIdentity: false, // Browse shows the piece, not the house (lib/pricing.ts)
    outreachAutomation: true,
    paperworkGeneration: true, // MVP-12: free while validating; flip to false when the paywall goes live
    consolidatedInvoicing: false,
    visionSearches: 3, // 3 lifetime trial uses, then paywall
    aiSearches: 3,
    aiSearchWindow: 'week',
    activeProjects: 2,
    vendorsPerProject: 3,
    seats: 1,
    savedItems: 50,
  },
  directory: {
    // The $29 tier: Browse plus the house behind every piece. Checkout, emails,
    // forms and AI search are excluded on the rate card; they stay at the free
    // tier's validation-era values here so Directory is never worse than free.
    // Flip them with the free tier when the paywall goes live.
    vendorIdentity: true,
    outreachAutomation: true,
    paperworkGeneration: true,
    consolidatedInvoicing: false,
    visionSearches: 3,
    aiSearches: 5,
    aiSearchWindow: 'week',
    activeProjects: null,
    vendorsPerProject: null,
    seats: 1,
    savedItems: null,
  },
  pro: {
    vendorIdentity: true,
    outreachAutomation: true,
    paperworkGeneration: true,
    consolidatedInvoicing: true,
    visionSearches: null,
    aiSearches: 5, // paid tier: 5 a day, not unlimited — see lib/usage.ts
    aiSearchWindow: 'day',
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

/**
 * Metered metrics need a usage_counter; this maps each to its reset window.
 * 'plan' means the window is the plan's own (aiSearchWindow): weekly on the
 * lower tiers, daily on Coordinator. See windowFor().
 */
export const METERED_METRICS = {
  visionSearches: 'lifetime',
  aiSearches: 'plan',
} as const;
export type MeteredMetric = keyof typeof METERED_METRICS;

/** The reset window a counter lives in. */
export type UsageWindow = 'lifetime' | 'day' | 'week';

export function windowFor(plan: PlanTier, metric: MeteredMetric): UsageWindow {
  const w = METERED_METRICS[metric];
  return w === 'plan' ? PLAN_ENTITLEMENTS[plan].aiSearchWindow : w;
}

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

/**
 * The usage_counters.period key for a metered metric on a plan:
 * 'lifetime', the UTC day ('2026-08-15'), or the ISO week ('2026-W33',
 * Monday 00:00 UTC to Sunday). The keys never collide, so a plan change
 * mid-week starts a fresh count rather than inheriting the other window's.
 */
export function usagePeriod(plan: PlanTier, metric: MeteredMetric, now = new Date()): string {
  const window = windowFor(plan, metric);
  if (window === 'lifetime') return 'lifetime';
  if (window === 'day') {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const { year, week } = isoWeek(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** ISO 8601 week number in UTC: weeks start Monday; week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { year, week };
}

/** "today" / "this week" for a counter line, or '' for a lifetime trial. */
export function windowLabel(window: UsageWindow): string {
  return window === 'day' ? 'today' : window === 'week' ? 'this week' : '';
}

/** When the window turns over, for a spent-allowance message. */
export function windowResetHint(window: UsageWindow): string {
  return window === 'day' ? 'the count resets at midnight UTC' : 'the count resets Monday 00:00 UTC';
}
