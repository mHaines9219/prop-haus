/**
 * The paperwork requirements library: every document a production might need,
 * with the conditions that trigger it and the reason each condition carries.
 *
 * This is DATA, evaluated by lib/requirements/evaluate.ts against a project
 * profile. The LLM never decides what is required; it only fills the profile.
 * Reasons shown to the user come from the trigger that fired, verbatim.
 *
 * Wording rule (product-wide): Prop Haus never says "legally required". A
 * trigger's `basis` says who wants the document — a vendor, a venue, an
 * insurer, a client, common practice — or that it may be required by law and
 * must be verified locally. The UI renders the basis label, never invents one.
 *
 * Adding a document is adding an entry here. Adding a vendor's own requirement
 * is a row in vendor_forms (lib/requirements/vendor.ts turns those into the
 * same shape at evaluation time).
 */

import type { ProductionType } from '../accounts';

export const LEVELS = ['required', 'recommended', 'conditional', 'informational'] as const;
/**
 * required      someone the production must satisfy asks for it
 * recommended   good practice; nothing breaks without it
 * conditional   depends on a fact the profile does not have yet → asks
 * informational a requirement to know about; nothing to file
 */
export type Level = (typeof LEVELS)[number];

export const BASES = ['vendor', 'venue', 'insurer', 'client', 'common', 'recommended', 'verify_locally'] as const;
export type Basis = (typeof BASES)[number];

export const BASIS_LABELS: Record<Basis, string> = {
  vendor: 'Required by vendor',
  venue: 'Required by the venue',
  insurer: 'Required by your insurer',
  client: 'Required by the client',
  common: 'Commonly required',
  recommended: 'Recommended',
  verify_locally: 'May be legally required. Verify locally.',
};

export const CATEGORIES = ['insurance', 'vendor', 'crew', 'cast', 'location', 'safety', 'vehicles', 'production'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  insurance: 'Insurance',
  vendor: 'Vendors and rentals',
  crew: 'Crew',
  cast: 'Cast and talent',
  location: 'Locations',
  safety: 'Safety',
  vehicles: 'Vehicles',
  production: 'Production',
};

export const STAGES = ['pre_production', 'production', 'wrap'] as const;
export type Stage = (typeof STAGES)[number];

/**
 * How the document comes to exist:
 *   upload    the production already has it (W-9, a signed client agreement)
 *   template  Prop Haus has a template that produces it
 *   external  another party issues it (a broker, a permit office, a vendor)
 *   track     satisfied elsewhere in the product (a vendor form filled at checkout)
 */
export const FULFILLMENTS = ['upload', 'template', 'external', 'track'] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];

export const PROVIDERS = ['production', 'vendor', 'client', 'insurer', 'venue', 'government', 'crew', 'talent', 'specialist'] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * A predicate over the profile. `path` is dot-separated. A path whose value is
 * absent makes the condition UNKNOWN, not false — evaluate.ts distinguishes.
 */
export type Condition =
  | { path: string; is: boolean }
  | { path: string; gt: number }
  | { path: string; in: readonly string[] }
  | { path: string; includes: string }
  | { path: string; known: boolean }
  | { any: Condition[] }
  | { all: Condition[] };

export type Trigger = {
  when: Condition;
  /**
   * For 'conditional' triggers only: the fact that makes the question worth
   * asking. The item shows as "needs information" when `given` is true and
   * `when` is still unknown. Without a gate, every unknown fact would ask.
   */
  given?: Condition;
  level: Level;
  basis: Basis;
  /** The sentence the user sees. Complete, present tense, no legal claims. */
  reason: string;
};

export type DocumentRequirement = {
  /** Stable id. Vendor rows and checklist state key on it; never rename one. */
  id: string;
  name: string;
  category: Category;
  stage: Stage;
  /** Omitted means every production type. */
  productionTypes?: readonly ProductionType[];
  triggers: Trigger[];
  fulfillment: Fulfillment;
  providedBy: Provider;
  /** Prop Haus template id (lib/templates/catalog.ts) when fulfillment is 'template'. */
  templateId?: string;
  /** True when what counts depends on where the production is. The UI flags it. */
  jurisdictionSensitive?: boolean;
  /** Requirement ids that should exist first. Informational for now. */
  prerequisites?: string[];
  /** Requirement ids this one's data flows into. Informational for now. */
  feeds?: string[];
  /** A note shown when the item is on the list. Practical, never a legal opinion. */
  note?: string;
};

// ---- condition helpers, so the data below stays readable ----

const is = (path: string, value = true): Condition => ({ path, is: value });
const gt = (path: string, value: number): Condition => ({ path, gt: value });
const any = (...c: Condition[]): Condition => ({ any: c });

const RENTING_ANYTHING = any(is('rentals.props'), is('rentals.furniture'), is('rentals.equipment'));
const HAS_CREW = gt('crew.count', 0);
const HAS_CAST = gt('cast.count', 0);
const HAS_LOCATIONS = gt('locations.count', 0);
const HAZARDS = any(
  is('risks.stunts'),
  is('risks.specialEffects'),
  is('risks.pyrotechnics'),
  is('risks.weapons'),
  is('risks.animals'),
  is('risks.drones'),
);

export const REQUIREMENTS: readonly DocumentRequirement[] = [
  // ---- insurance ----
  {
    id: 'certificate_of_insurance',
    name: 'Certificate of insurance (COI)',
    category: 'insurance',
    stage: 'pre_production',
    triggers: [
      { when: is('venue.requiresCoi'), level: 'required', basis: 'venue', reason: 'The venue asks for a certificate before load-in.' },
      { when: RENTING_ANYTHING, level: 'recommended', basis: 'common', reason: 'Rental houses usually ask for a certificate naming them as additional insured.' },
      { given: { path: 'venue.name', known: true }, when: is('venue.requiresCoi'), level: 'conditional', basis: 'venue', reason: 'Depends on whether the venue requires one.' },
    ],
    fulfillment: 'external',
    providedBy: 'insurer',
    note: 'Your broker issues this from your production policy. Prop Haus never issues or brokers coverage. Upload the certificate once you have it and it is attached to every vendor request.',
  },
  {
    id: 'hired_auto_coverage',
    name: 'Hired and non-owned auto coverage confirmation',
    category: 'insurance',
    stage: 'pre_production',
    triggers: [
      { when: is('vehicles.rentedTrucks'), level: 'recommended', basis: 'common', reason: 'A rented truck is usually not covered by the rental counter alone.' },
    ],
    fulfillment: 'external',
    providedBy: 'insurer',
    note: 'Ask your broker to confirm hired auto is on the policy, or add it for the rental dates.',
  },

  // ---- vendors and rentals ----
  {
    id: 'prop_inventory_condition_log',
    name: 'Prop and asset inventory with condition log',
    category: 'vendor',
    stage: 'production',
    triggers: [
      { when: RENTING_ANYTHING, level: 'recommended', basis: 'recommended', reason: 'This project includes rented props, furniture, or equipment.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'prop_inventory_condition_log',
    feeds: ['vendor_rental_agreement'],
  },
  {
    id: 'vendor_rental_agreement',
    name: 'Vendor rental agreement',
    category: 'vendor',
    stage: 'pre_production',
    triggers: [],
    fulfillment: 'track',
    providedBy: 'vendor',
    note: 'Filled from your order profile at checkout. You sign in Prop Haus.',
  },
  {
    id: 'vendor_account_application',
    name: 'Vendor account or credit application',
    category: 'vendor',
    stage: 'pre_production',
    triggers: [],
    fulfillment: 'track',
    providedBy: 'vendor',
    note: 'Filled from your order profile at checkout. Anything the vendor needs from you directly, like an EIN, is collected when you sign.',
  },
  {
    id: 'w9',
    name: 'W-9',
    category: 'vendor',
    stage: 'pre_production',
    triggers: [
      { when: is('client.billable'), level: 'recommended', basis: 'common', reason: 'Clients and agencies usually ask for a W-9 before paying an invoice.' },
    ],
    fulfillment: 'upload',
    providedBy: 'production',
    note: 'Your own IRS form. Upload the one you already have; Prop Haus does not generate tax forms.',
  },
  {
    id: 'credit_card_authorization',
    name: 'Credit card authorization',
    category: 'vendor',
    stage: 'pre_production',
    triggers: [],
    fulfillment: 'external',
    providedBy: 'vendor',
    note: 'The vendor sends their own form. Never enter card details into Prop Haus.',
  },

  // ---- crew ----
  {
    id: 'crew_deal_memo',
    name: 'Crew deal memo',
    category: 'crew',
    stage: 'pre_production',
    triggers: [
      { when: HAS_CREW, level: 'recommended', basis: 'recommended', reason: 'Every crew member should have rate, dates, and terms in writing.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'crew_deal_memo',
    jurisdictionSensitive: true,
    note: 'Worker classification rules vary by state and country. If crew are contractors, check the local test.',
  },
  {
    id: 'crew_emergency_contact',
    name: 'Crew emergency contact and medical information',
    category: 'crew',
    stage: 'pre_production',
    triggers: [
      { when: HAS_CREW, level: 'recommended', basis: 'recommended', reason: 'Someone on set needs to know who to call for each crew member.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'crew_emergency_contact',
  },
  {
    id: 'call_sheet',
    name: 'Call sheet',
    category: 'crew',
    stage: 'production',
    triggers: [
      { when: any(HAS_CREW, HAS_CAST), level: 'recommended', basis: 'recommended', reason: 'Crew and cast need the day’s times, location, and contacts in one place.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'call_sheet',
    prerequisites: ['crew_emergency_contact'],
  },

  // ---- cast ----
  {
    id: 'talent_release',
    name: 'Talent release',
    category: 'cast',
    stage: 'pre_production',
    triggers: [
      { when: HAS_CAST, level: 'recommended', basis: 'common', reason: 'On-camera talent grants the right to use their likeness.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'talent_release',
  },
  {
    id: 'minor_release',
    name: 'Minor release with parent or guardian consent',
    category: 'cast',
    stage: 'pre_production',
    triggers: [
      { when: is('cast.minors'), level: 'required', basis: 'common', reason: 'A minor cannot sign for themselves; a parent or guardian signs.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'minor_release',
    jurisdictionSensitive: true,
  },
  {
    id: 'minor_work_permit',
    name: 'Child performer work permit and set requirements',
    category: 'cast',
    stage: 'pre_production',
    triggers: [
      { when: is('cast.minors'), level: 'required', basis: 'verify_locally', reason: 'Most jurisdictions regulate minors on set: permits, hours, a studio teacher or guardian.' },
    ],
    fulfillment: 'external',
    providedBy: 'government',
    jurisdictionSensitive: true,
    note: 'Requirements depend on where you shoot and where the minor lives. Check the local labor office before the first call.',
  },

  // ---- locations ----
  {
    id: 'location_agreement',
    name: 'Location agreement',
    category: 'location',
    stage: 'pre_production',
    triggers: [
      { when: any({ path: 'locations.kinds', includes: 'practical' }, { path: 'locations.kinds', includes: 'venue' }), level: 'recommended', basis: 'common', reason: 'The owner of a practical location or venue grants access and terms in writing.' },
      { when: HAS_LOCATIONS, level: 'recommended', basis: 'common', reason: 'Each location should have written permission from whoever controls it.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'location_agreement',
  },
  {
    id: 'film_permit',
    name: 'Film permit',
    category: 'location',
    stage: 'pre_production',
    triggers: [
      { when: any(is('locations.publicProperty'), { path: 'locations.kinds', includes: 'public' }), level: 'required', basis: 'verify_locally', reason: 'Shooting on public property usually needs a permit from the city or film office.' },
      { given: { path: 'locations.kinds', includes: 'exterior' }, when: is('locations.publicProperty'), level: 'conditional', basis: 'verify_locally', reason: 'Depends on whether the exteriors are on public property.' },
    ],
    fulfillment: 'external',
    providedBy: 'government',
    jurisdictionSensitive: true,
  },
  {
    id: 'install_strike_schedule',
    name: 'Install and strike schedule',
    category: 'location',
    stage: 'production',
    triggers: [
      { when: is('venue.installStrike'), level: 'recommended', basis: 'recommended', reason: 'The venue and vendors need to agree on load-in and load-out windows.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'install_strike_schedule',
  },

  // ---- safety ----
  {
    id: 'safety_risk_assessment',
    name: 'Safety and risk assessment',
    category: 'safety',
    stage: 'pre_production',
    triggers: [
      { when: HAZARDS, level: 'recommended', basis: 'common', reason: 'The project includes stunts, effects, weapons, animals, or drones.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'safety_risk_assessment',
    note: 'Share it with your broker before the shoot. Hazards can change what a policy covers.',
  },
  {
    id: 'stunt_coordinator_plan',
    name: 'Stunt coordinator plan and sign-off',
    category: 'safety',
    stage: 'pre_production',
    triggers: [
      { when: is('risks.stunts'), level: 'recommended', basis: 'common', reason: 'Stunt work is planned and signed off by a qualified coordinator.' },
    ],
    fulfillment: 'external',
    providedBy: 'specialist',
    prerequisites: ['safety_risk_assessment'],
  },
  {
    id: 'pyrotechnics_permit',
    name: 'Pyrotechnics and open flame permit',
    category: 'safety',
    stage: 'pre_production',
    triggers: [
      { when: is('risks.pyrotechnics'), level: 'required', basis: 'verify_locally', reason: 'Fire effects are usually permitted and supervised by a licensed operator.' },
    ],
    fulfillment: 'external',
    providedBy: 'government',
    jurisdictionSensitive: true,
  },
  {
    id: 'drone_authorization',
    name: 'Drone operator authorization',
    category: 'safety',
    stage: 'pre_production',
    triggers: [
      { when: is('risks.drones'), level: 'required', basis: 'verify_locally', reason: 'Commercial drone work is regulated; the operator carries the authorization.' },
    ],
    fulfillment: 'external',
    providedBy: 'specialist',
    jurisdictionSensitive: true,
  },

  // ---- vehicles ----
  {
    id: 'vehicle_rental_agreement',
    name: 'Vehicle rental agreement',
    category: 'vehicles',
    stage: 'pre_production',
    triggers: [
      { when: is('vehicles.rentedTrucks'), level: 'required', basis: 'vendor', reason: 'The rental company’s own agreement covers the truck.' },
    ],
    fulfillment: 'external',
    providedBy: 'vendor',
    feeds: ['hired_auto_coverage'],
  },

  // ---- production and client ----
  {
    id: 'client_agreement',
    name: 'Client or production services agreement',
    category: 'production',
    stage: 'pre_production',
    productionTypes: ['commercial', 'experiential', 'event', 'editorial', 'music_video'],
    triggers: [
      { when: is('client.billable'), level: 'recommended', basis: 'common', reason: 'Scope, deliverables, and payment terms with the client belong in writing.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'client_agreement',
    feeds: ['change_order'],
  },
  {
    id: 'change_order',
    name: 'Change order',
    category: 'production',
    stage: 'production',
    productionTypes: ['commercial', 'experiential', 'event', 'editorial', 'music_video'],
    triggers: [
      { when: is('client.billable'), level: 'recommended', basis: 'recommended', reason: 'Client work changes scope; a change order keeps the budget and the client aligned.' },
    ],
    fulfillment: 'template',
    providedBy: 'production',
    templateId: 'change_order',
    prerequisites: ['client_agreement'],
  },
];

export const REQUIREMENTS_BY_ID: ReadonlyMap<string, DocumentRequirement> = new Map(REQUIREMENTS.map((r) => [r.id, r]));

export function getRequirement(id: string): DocumentRequirement | undefined {
  return REQUIREMENTS_BY_ID.get(id);
}
