/**
 * The requirements engine: a project profile in, a paperwork checklist out.
 *
 * Pure. No I/O, no LLM. Every item on the list carries the trigger reasons
 * that put it there, so the UI never has to explain a recommendation the
 * engine did not make. Tested on fixtures in evaluate.test.ts.
 *
 * Inputs beyond the profile are the per-project state the user has set
 * (attached a document, marked not applicable, marked requested), documents
 * on the org account that satisfy a requirement (the COI on file), and the
 * requirements the project's vendors impose (lib/requirements/vendor.ts).
 */

import type { PlanTier } from '../accounts';
import type { ProjectProfile } from '../project-profile';
import { getTemplate, templateAccess, type TemplateAccess } from '../templates/catalog';
import {
  BASIS_LABELS,
  CATEGORIES,
  REQUIREMENTS,
  getRequirement,
  type Basis,
  type Category,
  type Condition,
  type DocumentRequirement,
  type Fulfillment,
  type Level,
  type Provider,
  type Stage,
  type Trigger,
} from './library';
import type { VendorRequirement } from './vendor';

export const CHECKLIST_STATUSES = ['missing', 'needs_information', 'awaiting', 'complete', 'not_applicable'] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

/** What the user has done about one requirement on one project. */
export type RequirementState = {
  requirementId: string;
  status: 'attached' | 'awaiting' | 'not_applicable';
  document?: { id: string; name: string };
};

/** A document on the org account that satisfies a requirement for every project. */
export type AccountDocument = { requirementId: string; name: string };

export type ChecklistAction = 'upload' | 'use_template' | 'purchase_template' | 'request' | 'not_applicable' | 'reset';

export type ChecklistReason = { basis: Basis; label: string; text: string };

export type ChecklistItem = {
  requirementId: string;
  name: string;
  category: Category;
  stage: Stage;
  level: Level;
  status: ChecklistStatus;
  fulfillment: Fulfillment;
  providedBy: Provider;
  /** Vendors (by display name) whose own requirements put this here. */
  requiredBy: string[];
  reasons: ChecklistReason[];
  jurisdictionSensitive: boolean;
  note?: string;
  template?: { id: string; name: string; access: TemplateAccess };
  document?: { id?: string; name: string; source: 'project' | 'account' };
  actions: ChecklistAction[];
};

export type Advisory = { id: string; text: string };

export type Checklist = {
  items: ChecklistItem[];
  advisories: Advisory[];
  summary: { total: number; complete: number; open: number; needsInformation: number };
};

export type EvaluateInput = {
  profile: ProjectProfile;
  vendorRequirements?: VendorRequirement[];
  states?: RequirementState[];
  accountDocuments?: AccountDocument[];
  plan?: PlanTier;
};

// ---- conditions ----

export type Truth = true | false | 'unknown';

function lookup(path: string, profile: ProjectProfile): unknown {
  return path.split('.').reduce<unknown>((o, key) => {
    return o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined;
  }, profile);
}

/** True, false, or unknown when a fact the condition needs is not on the profile yet. */
export function testCondition(c: Condition, profile: ProjectProfile): Truth {
  if ('any' in c) {
    const results = c.any.map((x) => testCondition(x, profile));
    if (results.includes(true)) return true;
    return results.includes('unknown') ? 'unknown' : false;
  }
  if ('all' in c) {
    const results = c.all.map((x) => testCondition(x, profile));
    if (results.includes(false)) return false;
    return results.includes('unknown') ? 'unknown' : true;
  }
  const value = lookup(c.path, profile);
  if ('known' in c) return (value !== undefined && value !== null) === c.known;
  if (value === undefined || value === null) return 'unknown';
  if ('is' in c) return typeof value === 'boolean' ? value === c.is : 'unknown';
  if ('gt' in c) return typeof value === 'number' ? value > c.gt : 'unknown';
  if ('in' in c) return typeof value === 'string' ? c.in.includes(value) : 'unknown';
  if ('includes' in c) return Array.isArray(value) ? value.includes(c.includes) : 'unknown';
  return 'unknown';
}

// ---- evaluation ----

const LEVEL_RANK: Record<Level, number> = { required: 0, recommended: 1, conditional: 2, informational: 3 };
const STATUS_RANK: Record<ChecklistStatus, number> = { missing: 0, needs_information: 1, awaiting: 2, complete: 3, not_applicable: 4 };

export function evaluate(input: EvaluateInput): Checklist {
  const { plan = 'free' } = input;
  const profile = input.profile ?? {};
  const states = new Map((input.states ?? []).map((s) => [s.requirementId, s]));
  const account = new Map((input.accountDocuments ?? []).map((d) => [d.requirementId, d]));

  // Vendor requirements group by the library entry they point at; a vendor row
  // for an unknown id is dropped rather than shown with no name or fulfillment.
  const byVendor = new Map<string, VendorRequirement[]>();
  for (const v of input.vendorRequirements ?? []) {
    if (!getRequirement(v.requirementId)) continue;
    byVendor.set(v.requirementId, [...(byVendor.get(v.requirementId) ?? []), v]);
  }

  const items: ChecklistItem[] = [];
  for (const req of REQUIREMENTS) {
    if (req.productionTypes && profile.productionType && !req.productionTypes.includes(profile.productionType)) continue;

    const fired: Trigger[] = [];
    const pending: Trigger[] = [];
    for (const t of req.triggers) {
      if (t.level === 'conditional') {
        const gate = t.given ? testCondition(t.given, profile) : true;
        if (gate === true && testCondition(t.when, profile) === 'unknown') pending.push(t);
        continue;
      }
      if (testCondition(t.when, profile) === true) fired.push(t);
    }
    const vendors = byVendor.get(req.id) ?? [];
    if (fired.length === 0 && pending.length === 0 && vendors.length === 0) continue;

    const reasons: ChecklistReason[] = [
      ...vendors.map((v) => ({ basis: 'vendor' as const, label: `Required by ${v.vendorName}`, text: v.reason })),
      ...fired.map((t) => ({ basis: t.basis, label: BASIS_LABELS[t.basis], text: t.reason })),
    ];
    const needsInformation = fired.length === 0 && vendors.length === 0;
    if (needsInformation) {
      reasons.push(...pending.map((t) => ({ basis: t.basis, label: 'Needs information', text: t.reason })));
    }

    const level: Level = vendors.length > 0
      ? 'required'
      : needsInformation
        ? 'conditional'
        : fired.reduce<Level>((best, t) => (LEVEL_RANK[t.level] < LEVEL_RANK[best] ? t.level : best), fired[0].level);

    items.push(buildItem(req, {
      level,
      needsInformation,
      reasons,
      requiredBy: [...new Set(vendors.map((v) => v.vendorName))],
      state: states.get(req.id),
      accountDocument: account.get(req.id),
      plan,
    }));
  }

  items.sort(compareItems);
  const advisories = advisoriesFor(profile);
  return {
    items,
    advisories,
    summary: {
      total: items.length,
      complete: items.filter((i) => i.status === 'complete').length,
      open: items.filter((i) => i.status === 'missing' || i.status === 'awaiting').length,
      needsInformation: items.filter((i) => i.status === 'needs_information').length,
    },
  };
}

type BuildInput = {
  level: Level;
  needsInformation: boolean;
  reasons: ChecklistReason[];
  requiredBy: string[];
  state?: RequirementState;
  accountDocument?: AccountDocument;
  plan: PlanTier;
};

function buildItem(req: DocumentRequirement, b: BuildInput): ChecklistItem {
  const template = req.templateId ? getTemplate(req.templateId) : undefined;
  const templateInfo = template ? { id: template.id, name: template.name, access: templateAccess(b.plan, template) } : undefined;

  let status: ChecklistStatus;
  let document: ChecklistItem['document'];
  if (b.state?.status === 'not_applicable') {
    status = 'not_applicable';
  } else if (b.state?.status === 'attached' && b.state.document) {
    status = 'complete';
    document = { id: b.state.document.id, name: b.state.document.name, source: 'project' };
  } else if (b.accountDocument) {
    status = 'complete';
    document = { name: b.accountDocument.name, source: 'account' };
  } else if (b.state?.status === 'awaiting') {
    status = 'awaiting';
  } else if (b.needsInformation) {
    status = 'needs_information';
  } else {
    status = 'missing';
  }

  const actions: ChecklistAction[] = [];
  if (status === 'not_applicable' || (status === 'complete' && document?.source === 'project') || status === 'awaiting') {
    actions.push('reset');
  }
  if (status !== 'not_applicable' && status !== 'complete') {
    actions.push('upload');
    if (templateInfo) actions.push(templateInfo.access.kind === 'included' ? 'use_template' : 'purchase_template');
    if (req.fulfillment === 'external' && status !== 'awaiting') actions.push('request');
    actions.push('not_applicable');
  }
  if (status === 'complete' && document?.source === 'account') {
    actions.push('upload');
  }

  return {
    requirementId: req.id,
    name: req.name,
    category: req.category,
    stage: req.stage,
    level: b.level,
    status,
    fulfillment: req.fulfillment,
    providedBy: req.providedBy,
    requiredBy: b.requiredBy,
    reasons: b.reasons,
    jurisdictionSensitive: Boolean(req.jurisdictionSensitive),
    ...(req.note ? { note: req.note } : {}),
    ...(templateInfo ? { template: templateInfo } : {}),
    ...(document ? { document } : {}),
    actions,
  };
}

function compareItems(a: ChecklistItem, b: ChecklistItem): number {
  if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (a.level !== b.level) return LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
  if (a.category !== b.category) return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
  return a.name.localeCompare(b.name);
}

/**
 * Project-level flags that are not documents: things a broker or a
 * professional should look at. Never a blocker, never an offer to fix it.
 */
export function advisoriesFor(profile: ProjectProfile): Advisory[] {
  const out: Advisory[] = [];
  const r = profile.risks ?? {};
  if (r.stunts || r.pyrotechnics || r.weapons || r.specialEffects) {
    out.push({
      id: 'insurance_review',
      text: 'This project has stunts, effects, or weapons. Send the safety assessment to your broker; hazards can change what a policy covers.',
    });
  }
  if (profile.cast?.minors) {
    out.push({
      id: 'minors_review',
      text: 'Minors are on set. Permit, hours, and supervision rules depend on where you shoot and where the minor lives. Confirm them locally before the first call.',
    });
  }
  if (r.animals || r.drones) {
    out.push({
      id: 'specialist_review',
      text: 'Animals or drones on set usually mean a licensed handler or operator who carries their own paperwork. Ask them for it.',
    });
  }
  return out;
}

/** Items grouped in library category order, for the checklist page. */
export function groupByCategory(items: ChecklistItem[]): Array<{ category: Category; items: ChecklistItem[] }> {
  return CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}
