// Crew directory config (MVP-2). The /crew page is the ONLY vendor directory:
// the FUT-1 per-category pages under /book were removed in Sep 2026 in favor
// of one filterable list. Contractors keep granular `skills` tags; the filter
// groups those skills into the two roles productions actually hire for.

export type CrewRoleSlug = 'production-assistant' | 'delivery';

export type CrewRole = {
  slug: CrewRoleSlug;
  label: string;
  blurb: string;
  /** contractors.skills values that place a contractor in this role. */
  skills: string[];
};

export const CREW_ROLES: CrewRole[] = [
  {
    slug: 'production-assistant',
    label: 'Production assistants',
    blurb: 'Extra hands on set: load-in, load-out, set dressing, general assistance.',
    skills: ['set-hands', 'load-in', 'load-out', 'set-dressing', 'general'],
  },
  {
    slug: 'delivery',
    label: 'Delivery',
    blurb: 'Pickups, drop-offs, and same-day runs across the LA basin.',
    skills: ['delivery'],
  },
];

export const CREW_SKILL_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  'set-hands': 'Set hands',
  'load-in': 'Load-in',
  'load-out': 'Load-out',
  'set-dressing': 'Set dressing',
  general: 'General',
};

/** contractors.category value for the crew directory. */
export const CREW_CATEGORY = 'crew';

/** PLACEHOLDER inbox for roster applications — swap for the real crew address. */
export const CREW_JOIN_EMAIL = 'crew@prophaus.com';

/** Roster application limits, shared by the modal (client) and the API route. */
export const ROSTER_MAX_WORK_PHOTOS = 5;
export const ROSTER_MAX_FILE_BYTES = 5 * 1024 * 1024; // per image
export const ROSTER_MAX_TOTAL_BYTES = 20 * 1024 * 1024; // whole application

export const CREW_COPY = {
  eyebrow: 'Los Angeles crew',
  headline: 'Extra hands, on call.',
  blurb:
    'Hire vetted production assistants and delivery drivers for set days, load-in and load-out, and same-day runs. Request through the platform — we coordinate the rest.',
  ctaLabel: 'Request crew',
  joinEyebrow: 'For contractors',
  joinBlurb:
    'PA or driver in Los Angeles? Get listed and take set days, load-ins, and delivery runs through Prop Haus.',
  joinCta: 'Join the roster',
  footerNote:
    'All contractors are vetted by Prop Haus. Day rates shown are typical ranges; final rates confirmed on booking.',
};

/** "$650–$800/day", "$450/day", or "Rate on request" from cents. */
export function formatDayRate(low: number | null, high: number | null): string {
  if (!low && !high) return 'Rate on request';
  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (low && high && low !== high) return `${fmt(low)}–${fmt(high)}/day`;
  return `${fmt(low ?? high!)}/day`;
}

/** "los_angeles" → "Los Angeles". contractors.city is a slug. */
export function formatCrewCity(city: string | null | undefined): string | null {
  if (!city) return null;
  return city
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

export function isCrewRoleSlug(value: unknown): value is CrewRoleSlug {
  return typeof value === 'string' && CREW_ROLES.some((r) => r.slug === value);
}

export function getCrewRole(slug: CrewRoleSlug): CrewRole {
  return CREW_ROLES.find((r) => r.slug === slug)!;
}

export function contractorHasRole(skills: string[], role: CrewRole): boolean {
  return skills.some((s) => role.skills.includes(s));
}
