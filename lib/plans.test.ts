import { describe, expect, it } from 'vitest';
import { PLAN_TIERS } from './accounts';
import {
  METERED_METRICS,
  PLAN_ENTITLEMENTS,
  can,
  entitlementsFor,
  limitFor,
  remaining,
  usagePeriod,
  windowFor,
  windowLabel,
  windowResetHint,
  withinLimit,
} from './plans';

/** Every paywall gate routes through these; an off-by-one here is a free search or a blocked paying user. */

describe('PLAN_ENTITLEMENTS', () => {
  it('covers every plan tier and nothing else', () => {
    expect(Object.keys(PLAN_ENTITLEMENTS).sort()).toEqual([...PLAN_TIERS].sort());
  });

  it('entitlementsFor returns the table row', () => {
    expect(entitlementsFor('free')).toBe(PLAN_ENTITLEMENTS.free);
    expect(entitlementsFor('pro')).toBe(PLAN_ENTITLEMENTS.pro);
  });
});

describe('can', () => {
  it('reads boolean capabilities per plan', () => {
    expect(can('free', 'consolidatedInvoicing')).toBe(false);
    expect(can('pro', 'consolidatedInvoicing')).toBe(true);
    expect(can('free', 'outreachAutomation')).toBe(true);
    expect(can('pro', 'paperworkGeneration')).toBe(true);
  });
});

describe('limitFor', () => {
  it('returns the ceiling, or null for unlimited', () => {
    expect(limitFor('free', 'visionSearches')).toBe(3);
    expect(limitFor('pro', 'visionSearches')).toBeNull();
    expect(limitFor('free', 'aiSearches')).toBe(3);
    expect(limitFor('directory', 'aiSearches')).toBe(5);
    expect(limitFor('pro', 'aiSearches')).toBe(5);
  });
});

describe('withinLimit', () => {
  it('is open below the limit and closed at it', () => {
    expect(withinLimit('free', 'visionSearches', 0)).toBe(true);
    expect(withinLimit('free', 'visionSearches', 2)).toBe(true);
    expect(withinLimit('free', 'visionSearches', 3)).toBe(false);
    expect(withinLimit('free', 'visionSearches', 99)).toBe(false);
  });

  it('is always open on an unlimited metric', () => {
    expect(withinLimit('pro', 'activeProjects', 1_000_000)).toBe(true);
  });
});

describe('remaining', () => {
  it('counts down and never goes negative', () => {
    expect(remaining('free', 'savedItems', 0)).toBe(50);
    expect(remaining('free', 'savedItems', 49)).toBe(1);
    expect(remaining('free', 'savedItems', 50)).toBe(0);
    expect(remaining('free', 'savedItems', 500)).toBe(0);
  });

  it('is null on an unlimited metric', () => {
    expect(remaining('pro', 'savedItems', 10)).toBeNull();
  });
});

describe('usagePeriod', () => {
  it('maps each metered metric to a reset window, the AI one per plan', () => {
    expect(METERED_METRICS).toEqual({ visionSearches: 'lifetime', aiSearches: 'plan' });
    expect(windowFor('free', 'aiSearches')).toBe('week');
    expect(windowFor('directory', 'aiSearches')).toBe('week');
    expect(windowFor('pro', 'aiSearches')).toBe('day');
    expect(windowFor('pro', 'visionSearches')).toBe('lifetime');
  });

  it('is the literal lifetime key for the trial metric on every plan', () => {
    expect(usagePeriod('free', 'visionSearches', new Date('2026-08-15T23:30:00Z'))).toBe('lifetime');
    expect(usagePeriod('pro', 'visionSearches', new Date('2026-08-15T23:30:00Z'))).toBe('lifetime');
  });

  it('is the UTC calendar day on the daily plan, zero-padded', () => {
    expect(usagePeriod('pro', 'aiSearches', new Date('2026-08-15T23:30:00Z'))).toBe('2026-08-15');
    expect(usagePeriod('pro', 'aiSearches', new Date('2026-08-16T00:10:00Z'))).toBe('2026-08-16');
    expect(usagePeriod('pro', 'aiSearches', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('is the ISO week on the weekly plans: Monday to Sunday, UTC', () => {
    // 2026-08-15 is a Saturday, 2026-08-16 a Sunday, 2026-08-17 the next Monday.
    expect(usagePeriod('free', 'aiSearches', new Date('2026-08-15T23:30:00Z'))).toBe('2026-W33');
    expect(usagePeriod('free', 'aiSearches', new Date('2026-08-16T23:59:00Z'))).toBe('2026-W33');
    expect(usagePeriod('directory', 'aiSearches', new Date('2026-08-17T00:00:00Z'))).toBe('2026-W34');
    // Week 1 holds the first Thursday: Jan 1 2027 is a Friday, so it is still 2026-W53.
    expect(usagePeriod('free', 'aiSearches', new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(usagePeriod('free', 'aiSearches', new Date('2027-01-04T12:00:00Z'))).toBe('2027-W01');
    // Dec 29 2025 is a Monday and already belongs to 2026-W01.
    expect(usagePeriod('free', 'aiSearches', new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
  });

  it('defaults to now', () => {
    expect(usagePeriod('pro', 'aiSearches')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(usagePeriod('free', 'aiSearches')).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('labels the windows for the counter line and the spent message', () => {
    expect(windowLabel('day')).toBe('today');
    expect(windowLabel('week')).toBe('this week');
    expect(windowLabel('lifetime')).toBe('');
    expect(windowResetHint('day')).toMatch(/midnight UTC/);
    expect(windowResetHint('week')).toMatch(/Monday/);
  });
});
