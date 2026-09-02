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
    expect(limitFor('pro', 'aiSearchesPerDay')).toBe(10);
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
  it('maps each metered metric to a reset window', () => {
    expect(METERED_METRICS).toEqual({ visionSearches: 'lifetime', aiSearchesPerDay: 'daily' });
  });

  it('is the literal lifetime key for the trial metric', () => {
    expect(usagePeriod('visionSearches', new Date('2026-08-15T23:30:00Z'))).toBe('lifetime');
  });

  it('is the UTC calendar day for the daily metric, zero-padded', () => {
    expect(usagePeriod('aiSearchesPerDay', new Date('2026-08-15T23:30:00Z'))).toBe('2026-08-15');
    expect(usagePeriod('aiSearchesPerDay', new Date('2026-08-16T00:10:00Z'))).toBe('2026-08-16');
    expect(usagePeriod('aiSearchesPerDay', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('defaults to now', () => {
    expect(usagePeriod('aiSearchesPerDay')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
