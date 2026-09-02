/**
 * The Prop Haus template library: production paperwork we can produce for a
 * project, and the packs they sell in.
 *
 * Every template declares the standard field ids it consumes. The same id means
 * the same thing across every template (project_name is always the project's
 * name), so a value the project profile already knows is filled into every
 * document that asks for it — prefillTemplate() below is that step. The
 * companion JSON schemas the design team is producing use these same ids.
 *
 * Pricing is PLACEHOLDER. Access during the MVP is 'included' on every plan so
 * nobody hits a paywall while we validate; the shape supports single-template
 * and pack purchases when the paywall goes live (templateAccess()).
 */

import type { PlanTier } from '../accounts';
import type { OrderProfile } from '../order-profile';
import { formatAddress } from '../order-profile';
import { PRODUCTION_LABELS, type ProjectProfile } from '../project-profile';

export const TEMPLATE_FIELDS = [
  'project_name',
  'project_id',
  'production_company',
  'production_type',
  'client_company',
  'shoot_start_date',
  'shoot_end_date',
  'shoot_days',
  'location_city',
  'venue_name',
  'contact_name',
  'contact_email',
  'contact_phone',
  'company_address',
  'crew_count',
  'cast_count',
] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export type Template = {
  id: string;
  name: string;
  description: string;
  fields: readonly TemplateField[];
  /** PLACEHOLDER pricing, in cents. */
  priceCents: number;
  packIds: readonly string[];
  /** Set once the template is uploaded to Anvil; the mock filler ignores it. */
  anvilTemplateEid?: string;
};

export type TemplatePack = {
  id: string;
  name: string;
  description: string;
  /** PLACEHOLDER pricing, in cents. */
  priceCents: number;
};

const PACK = 'production_paperwork_pack';

// PLACEHOLDER: replace prices and descriptions with the real catalog.
export const TEMPLATE_PACKS: readonly TemplatePack[] = [
  {
    id: PACK,
    name: 'Production Paperwork Pack',
    description: 'Every Prop Haus template, prefilled from your project.',
    priceCents: 14900,
  },
];

const COMMON: readonly TemplateField[] = ['project_name', 'project_id', 'production_company', 'contact_name', 'contact_email'];

// PLACEHOLDER: replace with the real template catalog and prices.
export const TEMPLATES: readonly Template[] = [
  {
    id: 'prop_inventory_condition_log',
    name: 'Prop and asset inventory with condition log',
    description: 'One line per rented piece: vendor, condition in, condition out, photos.',
    fields: [...COMMON, 'shoot_start_date', 'shoot_end_date'],
    priceCents: 1900,
    packIds: [PACK],
  },
  {
    id: 'crew_deal_memo',
    name: 'Crew deal memo',
    description: 'Position, rate, dates, kit fees, and terms.',
    fields: [...COMMON, 'production_type', 'shoot_start_date', 'shoot_end_date', 'location_city'],
    priceCents: 2400,
    packIds: [PACK],
  },
  {
    id: 'crew_emergency_contact',
    name: 'Crew emergency contact and medical information',
    description: 'Who to call, allergies, and conditions the set medic should know.',
    fields: [...COMMON],
    priceCents: 900,
    packIds: [PACK],
  },
  {
    id: 'call_sheet',
    name: 'Call sheet',
    description: 'Times, location, weather, contacts, and the day’s schedule.',
    fields: [...COMMON, 'shoot_start_date', 'location_city', 'venue_name', 'crew_count', 'cast_count'],
    priceCents: 1400,
    packIds: [PACK],
  },
  {
    id: 'talent_release',
    name: 'Talent release',
    description: 'Likeness and performance rights for on-camera talent.',
    fields: [...COMMON, 'production_type', 'shoot_start_date'],
    priceCents: 1900,
    packIds: [PACK],
  },
  {
    id: 'minor_release',
    name: 'Minor release with parent or guardian consent',
    description: 'A talent release a parent or guardian signs on the minor’s behalf.',
    fields: [...COMMON, 'production_type', 'shoot_start_date', 'location_city'],
    priceCents: 1900,
    packIds: [PACK],
  },
  {
    id: 'location_agreement',
    name: 'Location agreement',
    description: 'Access, dates, fees, and restoration terms with a location owner.',
    fields: [...COMMON, 'shoot_start_date', 'shoot_end_date', 'venue_name', 'location_city'],
    priceCents: 2900,
    packIds: [PACK],
  },
  {
    id: 'install_strike_schedule',
    name: 'Install and strike schedule',
    description: 'Load-in and load-out windows by vendor and area.',
    fields: [...COMMON, 'venue_name', 'shoot_start_date', 'shoot_end_date'],
    priceCents: 900,
    packIds: [PACK],
  },
  {
    id: 'safety_risk_assessment',
    name: 'Safety and risk assessment',
    description: 'Hazards, controls, responsible people, and emergency plan.',
    fields: [...COMMON, 'shoot_start_date', 'location_city', 'venue_name'],
    priceCents: 2400,
    packIds: [PACK],
  },
  {
    id: 'client_agreement',
    name: 'Client or production services agreement',
    description: 'Scope, deliverables, schedule, and payment terms with a client.',
    fields: [...COMMON, 'client_company', 'production_type', 'shoot_start_date', 'shoot_end_date', 'company_address'],
    priceCents: 4900,
    packIds: [PACK],
  },
  {
    id: 'change_order',
    name: 'Change order',
    description: 'A scope or budget change the client approves in writing.',
    fields: [...COMMON, 'client_company', 'shoot_start_date'],
    priceCents: 1400,
    packIds: [PACK],
  },
];

export const TEMPLATES_BY_ID: ReadonlyMap<string, Template> = new Map(TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES_BY_ID.get(id);
}

// ---- access ----

export type TemplateAccess =
  | { kind: 'included'; via: 'plan' | 'pack' }
  | { kind: 'purchase'; priceCents: number; pack?: TemplatePack };

/**
 * Whether the org can use a template now, or would have to buy it (alone or
 * in a pack). MVP: included on every plan while validating; flip
 * TEMPLATES_INCLUDED_ON_FREE to false when template commerce goes live.
 */
export const TEMPLATES_INCLUDED_ON_FREE = true;

export function templateAccess(plan: PlanTier, template: Template, ownedPackIds: readonly string[] = []): TemplateAccess {
  if (plan === 'pro' || TEMPLATES_INCLUDED_ON_FREE) return { kind: 'included', via: 'plan' };
  if (template.packIds.some((id) => ownedPackIds.includes(id))) return { kind: 'included', via: 'pack' };
  const pack = TEMPLATE_PACKS.find((p) => template.packIds.includes(p.id));
  return { kind: 'purchase', priceCents: template.priceCents, ...(pack ? { pack } : {}) };
}

// ---- prefill ----

export type PrefillSource = {
  projectId: string;
  projectName: string;
  profile: ProjectProfile;
  orderProfile: OrderProfile;
};

export type Prefill = {
  /** Field id → value, for every field the template asks for that we know. */
  data: Record<string, string>;
  /** Field ids the template asks for that nothing in the profile answers. */
  missing: TemplateField[];
};

/** The values a template gets from what the project and the org already know. Pure. */
export function prefillTemplate(template: Template, src: PrefillSource): Prefill {
  const data: Record<string, string> = {};
  const missing: TemplateField[] = [];
  for (const field of template.fields) {
    const value = fieldValue(field, src);
    if (value) data[field] = value;
    else missing.push(field);
  }
  return { data, missing };
}

function fieldValue(field: TemplateField, src: PrefillSource): string | undefined {
  const { profile: p, orderProfile: o } = src;
  switch (field) {
    case 'project_name':
      return src.projectName;
    case 'project_id':
      return src.projectId.slice(0, 8).toUpperCase();
    case 'production_company':
      return o.company.legalName ?? o.company.dba;
    case 'production_type':
      return p.productionType ? PRODUCTION_LABELS[p.productionType] : undefined;
    case 'client_company':
      return p.client?.name;
    case 'shoot_start_date':
      return p.schedule?.start;
    case 'shoot_end_date':
      return p.schedule?.end;
    case 'shoot_days':
      return p.schedule?.shootDays !== undefined ? String(p.schedule.shootDays) : undefined;
    case 'location_city':
      return [p.locations?.city, p.locations?.region].filter(Boolean).join(', ') || undefined;
    case 'venue_name':
      return p.venue?.name;
    case 'contact_name':
      return o.contacts.ordering?.name;
    case 'contact_email':
      return o.contacts.ordering?.email;
    case 'contact_phone':
      return o.contacts.ordering?.phone;
    case 'company_address':
      return formatAddress(o.company.address) || undefined;
    case 'crew_count':
      return p.crew?.count !== undefined ? String(p.crew.count) : undefined;
    case 'cast_count':
      return p.cast?.count !== undefined ? String(p.cast.count) : undefined;
  }
}

/** "shoot_start_date" → "Shoot start date". */
export function fieldLabel(field: string): string {
  const words = field.replace(/_/g, ' ');
  return words[0].toUpperCase() + words.slice(1);
}
