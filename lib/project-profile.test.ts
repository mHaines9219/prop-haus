import { describe, expect, it } from 'vitest';
import { mergeProjectProfile, normalizeProjectProfile, profileFacts, profileGaps } from './project-profile';

describe('normalizeProjectProfile', () => {
  it('keeps known fields, drops unknown keys and blank sections, keeps false as false', () => {
    const p = normalizeProjectProfile({
      productionType: 'film',
      bogus: 1,
      schedule: { shootDays: '10', start: '2026-10-01', end: 'next week' },
      locations: { city: '  Brooklyn ', kinds: ['studio', 'nope', 'studio'], publicProperty: false },
      cast: { minors: 'yes' },
      risks: {},
      facts: ['one', 'one', 2],
    });
    expect(p).toEqual({
      productionType: 'film',
      schedule: { shootDays: 10, start: '2026-10-01' },
      locations: { city: 'Brooklyn', kinds: ['studio'], publicProperty: false },
      facts: ['one'],
    });
  });

  it('rejects an unknown production type and negative counts', () => {
    expect(normalizeProjectProfile({ productionType: 'podcast', crew: { count: -1 }, locations: { count: 0 } })).toEqual({});
  });
});

describe('mergeProjectProfile', () => {
  it('a patch replaces the fields it names, keeps the rest, unions lists, appends facts', () => {
    const base = normalizeProjectProfile({
      productionType: 'film',
      crew: { count: 10, union: false },
      rentals: { props: true, vendors: ['Omega'] },
      facts: ['a'],
    });
    const merged = mergeProjectProfile(base, {
      crew: { count: 15 },
      rentals: { vendors: ['Prop Heaven'], furniture: true },
      cast: { minors: true },
      facts: ['b', 'a'],
    });
    expect(merged).toEqual({
      productionType: 'film',
      crew: { count: 15, union: false },
      rentals: { props: true, furniture: true, vendors: ['Omega', 'Prop Heaven'] },
      cast: { minors: true },
      facts: ['a', 'b'],
    });
  });

  it('a patch can flip a boolean to false', () => {
    expect(mergeProjectProfile({ cast: { minors: true } }, { cast: { minors: false } })).toEqual({ cast: { minors: false } });
  });
});

describe('profileGaps', () => {
  it('asks the basics first on an empty profile', () => {
    const keys = profileGaps({}).map((g) => g.key);
    expect(keys.slice(0, 4)).toEqual(['productionType', 'schedule', 'locations.city', 'rentals']);
    expect(keys).not.toContain('venue.requiresCoi');
    expect(keys).not.toContain('client.billable');
  });

  it('stops asking what it knows, and asks venue and client questions only when relevant', () => {
    const keys = profileGaps({
      productionType: 'commercial',
      schedule: { shootDays: 2 },
      locations: { city: 'Los Angeles', publicProperty: false },
      rentals: { props: true },
      crew: { count: 8 },
      cast: { minors: false },
      risks: { stunts: false },
      vehicles: { rentedTrucks: false },
      venue: { name: 'Smashbox' },
    }).map((g) => g.key);
    expect(keys).toEqual(['venue.requiresCoi', 'client.billable']);
  });
});

describe('profileFacts', () => {
  it('reads out only what is known, as label/value rows', () => {
    const facts = profileFacts({
      productionType: 'film',
      schedule: { shootDays: 10 },
      locations: { city: 'Brooklyn', region: 'NY', count: 2 },
      crew: { count: 15 },
      cast: { minors: true },
      rentals: { props: true, furniture: true },
      risks: { stunts: true, drones: false },
      vehicles: { rentedTrucks: true },
    });
    expect(facts).toEqual([
      { label: 'Type', value: 'Film' },
      { label: 'Schedule', value: '10 days' },
      { label: 'Where', value: 'Brooklyn, NY' },
      { label: 'Locations', value: '2' },
      { label: 'Crew', value: '15' },
      { label: 'Minors', value: 'Yes' },
      { label: 'Rentals', value: 'props, furniture' },
      { label: 'Vehicles', value: 'rented trucks' },
      { label: 'Risks', value: 'stunts' },
    ]);
    expect(profileFacts({})).toEqual([]);
  });
});
