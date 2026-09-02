/**
 * The org's order profile: everything a one-click order needs, entered once.
 *
 * One org = one profile for now (multi-production profiles are a later task).
 * Tax IDs are never stored here — MVP-12 collects an EIN at sign time through
 * Anvil when a specific form needs one.
 *
 * This module is pure (types, readiness, defaults, normalization) so client
 * components can import it; reads and writes live in order-profile-store.ts.
 */

import type { InsuranceProfile } from './insurance/minimums';

export type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type Contact = { name?: string; email?: string; phone?: string };

export const ENTITY_TYPES = ['llc', 'corp', 'sole_prop', 'other'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type CoiDocument = NonNullable<InsuranceProfile['coiDocument']>;

export type OrderProfile = {
  company: {
    legalName?: string;
    dba?: string;
    entityType?: EntityType;
    address?: Address;
    billingAddress?: Address;
    phone?: string;
    website?: string;
  };
  contacts: {
    ordering?: Contact;
    accountsPayable?: Contact;
  };
  defaults: {
    rentalWindowDays?: number;
    deliveryAddress?: Address;
    deliveryNotes?: string;
  };
  insurance: InsuranceProfile;
  authorization: {
    formsOnBehalf: boolean;
    acceptedAt?: string;
    acceptedByUserId?: string;
  };
};

export const EMPTY_ORDER_PROFILE: OrderProfile = {
  company: {},
  contacts: {},
  defaults: {},
  insurance: {},
  authorization: { formsOnBehalf: false },
};

/** The sentence the authorization checkbox shows. Copy is load-bearing: keep it verbatim. */
export const AUTHORIZATION_SENTENCE =
  'Prop Haus may complete vendor forms and send vendor requests using the information above. I sign anything that needs a signature.';

// ---- readiness ----

export type OrderReadiness = { ready: boolean; missing: string[] };

/**
 * What the click still needs. Insurance is deliberately absent: an order can go
 * out without a COI on file, and the outreach email says "COI to follow".
 */
export function orderReadiness(profile: OrderProfile): OrderReadiness {
  const missing: string[] = [];
  if (!profile.company.legalName) missing.push('Company legal name');
  if (!profile.contacts.ordering?.name) missing.push('Ordering contact name');
  if (!profile.contacts.ordering?.email) missing.push('Ordering contact email');

  const { rentalWindowDays, deliveryAddress, deliveryNotes } = profile.defaults;
  const notesFallback = Boolean(rentalWindowDays && deliveryNotes);
  if (!isCompleteAddress(deliveryAddress) && !notesFallback) missing.push('Delivery address');

  if (!profile.authorization.formsOnBehalf) missing.push('Authorization to complete forms');
  return { ready: missing.length === 0, missing };
}

export function isCompleteAddress(a: Address | undefined): a is Required<Pick<Address, 'line1' | 'city' | 'state' | 'zip'>> & Address {
  return Boolean(a?.line1 && a.city && a.state && a.zip);
}

/** "123 Main St, Los Angeles, CA 90001" — one line, for mono readouts. */
export function formatAddress(a: Address | undefined): string {
  if (!a) return '';
  const street = [a.line1, a.line2].filter(Boolean).join(' ');
  const region = [a.state, a.zip].filter(Boolean).join(' ');
  return [street, a.city, region].filter(Boolean).join(', ');
}

// ---- defaults the click resolves ----

export type RentalWindow = { rentalStart: string; rentalEnd: string };

/**
 * The window an order gets when the user doesn't pick one: it starts the next
 * business day and runs `rentalWindowDays` days. Null when the profile has no
 * default — the order is then placed without dates.
 */
export function defaultRentalWindow(profile: OrderProfile, now = new Date()): RentalWindow | null {
  const days = profile.defaults.rentalWindowDays;
  if (!days) return null;
  const start = nextBusinessDay(now);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { rentalStart: isoDate(start), rentalEnd: isoDate(end) };
}

export type OrderDefaults = {
  rentalStart?: string;
  rentalEnd?: string;
  deliveryAddress?: Address;
  deliveryNotes?: string;
};

/** Everything checkout fills in when the body leaves it out. */
export function orderDefaults(profile: OrderProfile, now = new Date()): OrderDefaults {
  const window = defaultRentalWindow(profile, now);
  const { deliveryAddress, deliveryNotes } = profile.defaults;
  return {
    ...(window ?? {}),
    ...(isCompleteAddress(deliveryAddress) ? { deliveryAddress } : {}),
    ...(deliveryNotes ? { deliveryNotes } : {}),
  };
}

function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---- normalization (what the PATCH body and the jsonb column are allowed to hold) ----

/** Coerce untrusted input into a well-typed profile. Unknown keys are dropped, blanks become absent. */
export function normalizeOrderProfile(raw: unknown): OrderProfile {
  const o = obj(raw);
  const company = obj(o.company);
  const contacts = obj(o.contacts);
  const defaults = obj(o.defaults);
  const insurance = obj(o.insurance);
  const authorization = obj(o.authorization);
  const coi = obj(insurance.coiDocument);

  return {
    company: strip({
      legalName: str(company.legalName),
      dba: str(company.dba),
      entityType: ENTITY_TYPES.find((t) => t === company.entityType),
      address: normalizeAddress(company.address),
      billingAddress: normalizeAddress(company.billingAddress),
      phone: str(company.phone),
      website: str(company.website),
    }),
    contacts: strip({
      ordering: contact(contacts.ordering),
      accountsPayable: contact(contacts.accountsPayable),
    }),
    defaults: strip({
      rentalWindowDays: positiveInt(defaults.rentalWindowDays),
      deliveryAddress: normalizeAddress(defaults.deliveryAddress),
      deliveryNotes: str(defaults.deliveryNotes),
    }),
    insurance: strip({
      carrier: str(insurance.carrier),
      policyNumber: str(insurance.policyNumber),
      glLimit: positiveInt(insurance.glLimit),
      aggregateLimit: positiveInt(insurance.aggregateLimit),
      workersCompLimit: positiveInt(insurance.workersCompLimit),
      additionalInsuredAvailable:
        typeof insurance.additionalInsuredAvailable === 'boolean'
          ? insurance.additionalInsuredAvailable
          : undefined,
      expiresAt: str(insurance.expiresAt),
      broker: contact(insurance.broker),
      coiDocument:
        str(coi.storagePath) && str(coi.name) && str(coi.uploadedAt)
          ? { storagePath: str(coi.storagePath)!, name: str(coi.name)!, uploadedAt: str(coi.uploadedAt)! }
          : undefined,
    }),
    authorization: strip({
      formsOnBehalf: authorization.formsOnBehalf === true,
      acceptedAt: str(authorization.acceptedAt),
      acceptedByUserId: str(authorization.acceptedByUserId),
    }) as OrderProfile['authorization'],
  };
}

export function normalizeAddress(raw: unknown): Address | undefined {
  const a = obj(raw);
  const address = strip({
    line1: str(a.line1),
    line2: str(a.line2),
    city: str(a.city),
    state: str(a.state),
    zip: str(a.zip),
  });
  return Object.keys(address).length > 0 ? address : undefined;
}

function contact(raw: unknown): Contact | undefined {
  const c = obj(raw);
  const out = strip({ name: str(c.name), email: str(c.email), phone: str(c.phone) });
  return Object.keys(out).length > 0 ? out : undefined;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, 500) : undefined;
}

function positiveInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
