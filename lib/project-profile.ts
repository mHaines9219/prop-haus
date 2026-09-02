/**
 * The project profile: what we know about one production, as structured data.
 *
 * The intake conversation (lib/intake) fills this in; the requirements engine
 * (lib/requirements) reads it; templates (lib/templates) prefill from it. The
 * transcript is never the source of truth — a fact the user states becomes a
 * field here or it does not count.
 *
 * Every field is tri-state: absent means "not known yet", which is different
 * from false. The engine treats unknown and false differently (a conditional
 * rule on an unknown fact asks; on a false fact it stays quiet).
 *
 * Pure module: types, normalization, merge, and the gap list. Reads and writes
 * live in project-profile-store.ts.
 */

import { PRODUCTION_TYPES, type ProductionType } from './accounts';

export const LOCATION_KINDS = ['studio', 'practical', 'venue', 'exterior', 'public'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export type ProjectProfile = {
  productionType?: ProductionType;
  /** One sentence in the user's own words. */
  summary?: string;
  schedule?: { start?: string; end?: string; shootDays?: number };
  locations?: {
    count?: number;
    city?: string;
    region?: string;
    country?: string;
    kinds?: LocationKind[];
    publicProperty?: boolean;
  };
  venue?: { name?: string; requiresCoi?: boolean; installStrike?: boolean };
  crew?: { count?: number; contractors?: boolean; union?: boolean };
  cast?: { count?: number; minors?: boolean };
  rentals?: {
    props?: boolean;
    furniture?: boolean;
    equipment?: boolean;
    vendorCount?: number;
    vendors?: string[];
  };
  vehicles?: { rentedTrucks?: boolean; pictureVehicles?: boolean };
  risks?: {
    stunts?: boolean;
    specialEffects?: boolean;
    pyrotechnics?: boolean;
    weapons?: boolean;
    animals?: boolean;
    drones?: boolean;
  };
  client?: { name?: string; billable?: boolean };
  /** Facts that fit no field. Capped; shown to the user, read by nothing else. */
  facts?: string[];
};

export const EMPTY_PROJECT_PROFILE: ProjectProfile = {};

// ---- normalization ----

/** Coerce untrusted input (a PATCH body, the LLM's patch, the jsonb column) into a well-typed profile. */
export function normalizeProjectProfile(raw: unknown): ProjectProfile {
  const o = obj(raw);
  const schedule = obj(o.schedule);
  const locations = obj(o.locations);
  const venue = obj(o.venue);
  const crew = obj(o.crew);
  const cast = obj(o.cast);
  const rentals = obj(o.rentals);
  const vehicles = obj(o.vehicles);
  const risks = obj(o.risks);
  const client = obj(o.client);

  return strip({
    productionType: PRODUCTION_TYPES.find((t) => t === o.productionType),
    summary: str(o.summary, 300),
    schedule: section({
      start: isoDate(schedule.start),
      end: isoDate(schedule.end),
      shootDays: positiveInt(schedule.shootDays),
    }),
    locations: section({
      count: positiveInt(locations.count),
      city: str(locations.city, 120),
      region: str(locations.region, 120),
      country: str(locations.country, 120),
      kinds: enumList(locations.kinds, LOCATION_KINDS),
      publicProperty: bool(locations.publicProperty),
    }),
    venue: section({
      name: str(venue.name, 200),
      requiresCoi: bool(venue.requiresCoi),
      installStrike: bool(venue.installStrike),
    }),
    crew: section({
      count: nonNegativeInt(crew.count),
      contractors: bool(crew.contractors),
      union: bool(crew.union),
    }),
    cast: section({ count: nonNegativeInt(cast.count), minors: bool(cast.minors) }),
    rentals: section({
      props: bool(rentals.props),
      furniture: bool(rentals.furniture),
      equipment: bool(rentals.equipment),
      vendorCount: positiveInt(rentals.vendorCount),
      vendors: strList(rentals.vendors, 20, 120),
    }),
    vehicles: section({
      rentedTrucks: bool(vehicles.rentedTrucks),
      pictureVehicles: bool(vehicles.pictureVehicles),
    }),
    risks: section({
      stunts: bool(risks.stunts),
      specialEffects: bool(risks.specialEffects),
      pyrotechnics: bool(risks.pyrotechnics),
      weapons: bool(risks.weapons),
      animals: bool(risks.animals),
      drones: bool(risks.drones),
    }),
    client: section({ name: str(client.name, 200), billable: bool(client.billable) }),
    facts: strList(o.facts, 12, 240),
  });
}

/**
 * Apply a patch on top of a profile. A field the patch names replaces the old
 * value; a field it omits is kept. Lists union. Facts append (deduped, capped).
 */
export function mergeProjectProfile(base: ProjectProfile, patch: ProjectProfile): ProjectProfile {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'facts') {
      const merged = [...(base.facts ?? []), ...(patch.facts ?? [])];
      out.facts = [...new Set(merged)].slice(0, 12);
    } else if (isPlainObject(value) && isPlainObject(out[key])) {
      const section: Record<string, unknown> = { ...(out[key] as Record<string, unknown>) };
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        if (Array.isArray(v) && Array.isArray(section[k])) {
          section[k] = [...new Set([...(section[k] as unknown[]), ...v])];
        } else {
          section[k] = v;
        }
      }
      out[key] = section;
    } else {
      out[key] = value;
    }
  }
  return normalizeProjectProfile(out);
}

// ---- what we still need to ask ----

export type ProfileGap = {
  /** Stable key, so a yes/no answer can be routed back to the field it answers. */
  key: string;
  question: string;
  /** Lower asks first. */
  priority: number;
};

/**
 * The questions the profile still leaves open, most important first. The LLM
 * phrases them; this list decides what gets asked. Deterministic so a test can
 * pin it and so a mock conversation asks the same things a live one would.
 */
export function profileGaps(p: ProjectProfile): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  const ask = (key: string, question: string, priority: number) => gaps.push({ key, question, priority });

  if (!p.productionType) ask('productionType', 'What kind of production is this: film, TV, commercial, event, or something else?', 1);
  if (!p.schedule?.start && !p.schedule?.shootDays) ask('schedule', 'When does it shoot, and for how many days?', 2);
  if (!p.locations?.city) ask('locations.city', 'Where is it shooting?', 3);
  if (rentalsUnknown(p)) ask('rentals', 'Are you renting props, furniture, or equipment from vendors?', 4);
  if (p.crew?.count === undefined) ask('crew.count', 'Roughly how many crew are on it?', 5);
  if (p.cast?.minors === undefined) ask('cast.minors', 'Will any minors be on set as cast or crew?', 6);
  if (risksUnknown(p)) ask('risks', 'Any stunts, special effects, weapons, animals, or drones?', 7);
  if (p.locations?.publicProperty === undefined) ask('locations.publicProperty', 'Any shooting on streets, parks, or other public property?', 8);
  if ((p.venue?.name || p.locations?.kinds?.includes('venue')) && p.venue?.requiresCoi === undefined) {
    ask('venue.requiresCoi', 'Does the venue require a certificate of insurance?', 9);
  }
  if (p.vehicles?.rentedTrucks === undefined) ask('vehicles.rentedTrucks', 'Any rented trucks or production vehicles?', 10);
  if (isClientWork(p) && p.client?.billable === undefined) ask('client.billable', 'Is there a client or agency you are billing for this?', 11);

  return gaps.sort((a, b) => a.priority - b.priority);
}

function rentalsUnknown(p: ProjectProfile): boolean {
  const r = p.rentals;
  return !r || (r.props === undefined && r.furniture === undefined && r.equipment === undefined);
}

function risksUnknown(p: ProjectProfile): boolean {
  const r = p.risks;
  return !r || Object.values(r).every((v) => v === undefined);
}

function isClientWork(p: ProjectProfile): boolean {
  return p.productionType === 'commercial' || p.productionType === 'experiential' || p.productionType === 'event' || p.productionType === 'editorial';
}

/** "productionType" → the value a yes/no answer sets, when the question was a yes/no one. */
export const YES_NO_GAP_FIELDS: Record<string, string> = {
  'cast.minors': 'cast.minors',
  'locations.publicProperty': 'locations.publicProperty',
  'venue.requiresCoi': 'venue.requiresCoi',
  'vehicles.rentedTrucks': 'vehicles.rentedTrucks',
  'client.billable': 'client.billable',
};

// ---- readout ----

export type ProfileFact = { label: string; value: string };

/** The profile as label/value rows for a mono readout. Only known facts appear. */
export function profileFacts(p: ProjectProfile): ProfileFact[] {
  const out: ProfileFact[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) out.push({ label, value });
  };

  add('Type', p.productionType && PRODUCTION_LABELS[p.productionType]);
  const days = p.schedule?.shootDays;
  const dates = [p.schedule?.start, p.schedule?.end].filter(Boolean).join(' to ');
  add('Schedule', [dates, days ? `${days} day${days === 1 ? '' : 's'}` : ''].filter(Boolean).join(', '));
  add('Where', [p.locations?.city, p.locations?.region, p.locations?.country].filter(Boolean).join(', '));
  add('Locations', p.locations?.count ? String(p.locations.count) : undefined);
  add('Venue', p.venue?.name);
  add('Crew', p.crew?.count !== undefined ? String(p.crew.count) : undefined);
  add('Cast', p.cast?.count !== undefined ? String(p.cast.count) : undefined);
  add('Minors', yesNo(p.cast?.minors));
  add('Rentals', rentalsLabel(p));
  add('Vendors', p.rentals?.vendors?.length ? p.rentals.vendors.join(', ') : p.rentals?.vendorCount ? String(p.rentals.vendorCount) : undefined);
  add('Vehicles', vehiclesLabel(p));
  add('Risks', risksLabel(p));
  add('Public property', yesNo(p.locations?.publicProperty));
  add('Venue needs COI', yesNo(p.venue?.requiresCoi));
  add('Client', p.client?.name ?? (p.client?.billable ? 'Yes' : undefined));
  return out;
}

export const PRODUCTION_LABELS: Record<ProductionType, string> = {
  film: 'Film',
  television: 'Television',
  commercial: 'Commercial',
  music_video: 'Music video',
  editorial: 'Editorial',
  event: 'Event',
  experiential: 'Experiential',
  theater: 'Theater',
  other: 'Other',
};

function rentalsLabel(p: ProjectProfile): string | undefined {
  const r = p.rentals;
  if (!r) return undefined;
  const on = [r.props && 'props', r.furniture && 'furniture', r.equipment && 'equipment'].filter(Boolean);
  if (on.length > 0) return on.join(', ');
  if (r.props === false || r.furniture === false || r.equipment === false) return 'None';
  return undefined;
}

function vehiclesLabel(p: ProjectProfile): string | undefined {
  const v = p.vehicles;
  if (!v) return undefined;
  const on = [v.rentedTrucks && 'rented trucks', v.pictureVehicles && 'picture vehicles'].filter(Boolean);
  if (on.length > 0) return on.join(', ');
  if (v.rentedTrucks === false) return 'None';
  return undefined;
}

function risksLabel(p: ProjectProfile): string | undefined {
  const r = p.risks;
  if (!r) return undefined;
  const names: Record<keyof NonNullable<ProjectProfile['risks']>, string> = {
    stunts: 'stunts',
    specialEffects: 'special effects',
    pyrotechnics: 'pyrotechnics',
    weapons: 'weapons',
    animals: 'animals',
    drones: 'drones',
  };
  const on = (Object.keys(names) as Array<keyof typeof names>).filter((k) => r[k]).map((k) => names[k]);
  if (on.length > 0) return on.join(', ');
  if (Object.values(r).some((v) => v === false)) return 'None';
  return undefined;
}

function yesNo(v: boolean | undefined): string | undefined {
  return v === undefined ? undefined : v ? 'Yes' : 'No';
}

// ---- small coercions ----

function obj(v: unknown): Record<string, unknown> {
  return isPlainObject(v) ? v : {};
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function positiveInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function nonNegativeInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function isoDate(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

function enumList<T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x)))];
  return out.length > 0 ? out : undefined;
}

function strList(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => str(x, maxLen)).filter((x): x is string => Boolean(x)))].slice(0, maxItems);
  return out.length > 0 ? out : undefined;
}

/** Drop undefined keys; drop a section whose every key is undefined. */
function section<T extends Record<string, unknown>>(o: T): T | undefined {
  const kept = strip(o);
  return Object.keys(kept).length > 0 ? kept : undefined;
}

function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
