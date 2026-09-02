import { describe, expect, it } from 'vitest';
import {
  BUDGET_BANDS,
  HEARD_ABOUT_US,
  MEMBERSHIP_ROLES,
  ORG_TYPES,
  PLAN_TIERS,
  PRODUCTION_TYPES,
  PROFESSIONS,
  PROJECT_VOLUME_BANDS,
} from './accounts';

/**
 * These enums are stored as text and validated in app code, so the arrays are
 * the schema. A duplicate or a non-slug value would pass TypeScript and fail
 * the first form that round-trips it.
 */

const ENUMS = {
  ORG_TYPES,
  MEMBERSHIP_ROLES,
  PROFESSIONS,
  HEARD_ABOUT_US,
  PLAN_TIERS,
  PRODUCTION_TYPES,
  PROJECT_VOLUME_BANDS,
  BUDGET_BANDS,
} as const;

describe('account enums', () => {
  it.each(Object.entries(ENUMS))('%s is non-empty with unique values', (_name, values) => {
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
  });

  it.each([
    ['ORG_TYPES', ORG_TYPES],
    ['MEMBERSHIP_ROLES', MEMBERSHIP_ROLES],
    ['PROFESSIONS', PROFESSIONS],
    ['HEARD_ABOUT_US', HEARD_ABOUT_US],
    ['PLAN_TIERS', PLAN_TIERS],
    ['PRODUCTION_TYPES', PRODUCTION_TYPES],
    ['BUDGET_BANDS', BUDGET_BANDS],
  ] as const)('%s values are lowercase snake_case identifiers', (_name, values) => {
    for (const v of values) expect(v).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  it('offers an escape hatch where the form has a free-text fallback', () => {
    expect(PROFESSIONS).toContain('other');
    expect(HEARD_ABOUT_US).toContain('other');
    expect(PRODUCTION_TYPES).toContain('other');
  });

  it('starts every org on the free tier and every org with an owner', () => {
    expect(PLAN_TIERS[0]).toBe('free');
    expect(MEMBERSHIP_ROLES[0]).toBe('owner');
    expect(ORG_TYPES).toEqual(['personal', 'company']);
  });
});
