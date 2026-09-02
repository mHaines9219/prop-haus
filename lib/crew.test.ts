import { describe, expect, it } from 'vitest';
import { CREW_CATEGORY, CREW_ROLES, CREW_SKILL_LABELS, contractorHasRole, getCrewRole, isCrewRoleSlug } from './crew';

/** The /crew filter groups skill tags into roles; a tag in no role or two roles breaks the list. */

describe('CREW_ROLES', () => {
  it('has unique slugs and every skill labelled once', () => {
    const slugs = CREW_ROLES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const skills = CREW_ROLES.flatMap((r) => r.skills);
    expect(new Set(skills).size).toBe(skills.length);
    for (const s of skills) expect(CREW_SKILL_LABELS[s]).toBeTypeOf('string');
  });

  it('is filed under the crew contractor category', () => {
    expect(CREW_CATEGORY).toBe('crew');
  });
});

describe('isCrewRoleSlug', () => {
  it('accepts the known slugs only', () => {
    expect(isCrewRoleSlug('delivery')).toBe(true);
    expect(isCrewRoleSlug('production-assistant')).toBe(true);
    expect(isCrewRoleSlug('catering')).toBe(false);
    expect(isCrewRoleSlug('')).toBe(false);
    expect(isCrewRoleSlug(undefined)).toBe(false);
    expect(isCrewRoleSlug(42)).toBe(false);
    expect(isCrewRoleSlug({ slug: 'delivery' })).toBe(false);
  });
});

describe('getCrewRole', () => {
  it('returns the role for a slug', () => {
    expect(getCrewRole('delivery')).toMatchObject({ slug: 'delivery', label: 'Delivery', skills: ['delivery'] });
  });
});

describe('contractorHasRole', () => {
  const pa = getCrewRole('production-assistant');
  const delivery = getCrewRole('delivery');

  it('matches on any one overlapping skill', () => {
    expect(contractorHasRole(['load-in'], pa)).toBe(true);
    expect(contractorHasRole(['delivery', 'general'], pa)).toBe(true);
    expect(contractorHasRole(['delivery'], delivery)).toBe(true);
  });

  it('is false with no overlap or no skills', () => {
    expect(contractorHasRole(['delivery'], pa)).toBe(false);
    expect(contractorHasRole(['general'], delivery)).toBe(false);
    expect(contractorHasRole([], pa)).toBe(false);
    expect(contractorHasRole(['unknown-skill'], delivery)).toBe(false);
  });
});
