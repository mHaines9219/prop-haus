import { describe, expect, it } from 'vitest';
import type { ProjectProfile } from '../project-profile';
import { advisoriesFor, evaluate, groupByCategory, testCondition } from './evaluate';
import { REQUIREMENTS, getRequirement } from './library';
import { getTemplate } from '../templates/catalog';

/**
 * The engine is deterministic: the same profile always yields the same list
 * with the same reasons, and every reason on the list comes from a trigger in
 * the library, never from anywhere else.
 */

const brooklynIndie: ProjectProfile = {
  productionType: 'film',
  schedule: { shootDays: 10 },
  locations: { count: 2, city: 'Brooklyn', region: 'NY', publicProperty: false },
  crew: { count: 15 },
  cast: { count: 4, minors: true },
  rentals: { props: true, furniture: true, vendorCount: 3 },
  vehicles: { rentedTrucks: true },
  risks: { stunts: true },
};

const byId = (items: ReturnType<typeof evaluate>['items']) => new Map(items.map((i) => [i.requirementId, i]));

describe('testCondition', () => {
  const p: ProjectProfile = { cast: { minors: false }, crew: { count: 3 }, locations: { kinds: ['studio', 'public'] }, productionType: 'event' };

  it('distinguishes unknown from false', () => {
    expect(testCondition({ path: 'cast.minors', is: true }, p)).toBe(false);
    expect(testCondition({ path: 'risks.stunts', is: true }, p)).toBe('unknown');
  });

  it('handles gt, in, includes', () => {
    expect(testCondition({ path: 'crew.count', gt: 0 }, p)).toBe(true);
    expect(testCondition({ path: 'crew.count', gt: 3 }, p)).toBe(false);
    expect(testCondition({ path: 'productionType', in: ['event', 'film'] }, p)).toBe(true);
    expect(testCondition({ path: 'locations.kinds', includes: 'public' }, p)).toBe(true);
    expect(testCondition({ path: 'locations.kinds', includes: 'venue' }, p)).toBe(false);
    expect(testCondition({ path: 'venue.name', known: true }, p)).toBe(false);
    expect(testCondition({ path: 'crew.count', known: true }, p)).toBe(true);
  });

  it('any is true if one is true, unknown if none true and one unknown', () => {
    expect(testCondition({ any: [{ path: 'risks.stunts', is: true }, { path: 'crew.count', gt: 0 }] }, p)).toBe(true);
    expect(testCondition({ any: [{ path: 'risks.stunts', is: true }, { path: 'cast.minors', is: true }] }, p)).toBe('unknown');
    expect(testCondition({ any: [{ path: 'cast.minors', is: true }] }, p)).toBe(false);
  });

  it('all is false if one is false, unknown if one unknown', () => {
    expect(testCondition({ all: [{ path: 'crew.count', gt: 0 }, { path: 'cast.minors', is: true }] }, p)).toBe(false);
    expect(testCondition({ all: [{ path: 'crew.count', gt: 0 }, { path: 'risks.stunts', is: true }] }, p)).toBe('unknown');
    expect(testCondition({ all: [{ path: 'crew.count', gt: 0 }, { path: 'productionType', in: ['event'] }] }, p)).toBe(true);
  });
});

describe('evaluate', () => {
  it('an empty profile yields an empty list and no advisories', () => {
    const list = evaluate({ profile: {} });
    expect(list.items).toEqual([]);
    expect(list.advisories).toEqual([]);
    expect(list.summary).toEqual({ total: 0, complete: 0, open: 0, needsInformation: 0 });
  });

  it('the Brooklyn indie triggers the expected documents with their reasons', () => {
    const items = byId(evaluate({ profile: brooklynIndie }).items);

    const log = items.get('prop_inventory_condition_log')!;
    expect(log.level).toBe('recommended');
    expect(log.status).toBe('missing');
    expect(log.reasons).toEqual([
      { basis: 'recommended', label: 'Recommended', text: 'This project includes rented props, furniture, or equipment.' },
    ]);
    expect(log.template?.id).toBe('prop_inventory_condition_log');
    expect(log.actions).toEqual(['upload', 'use_template', 'not_applicable']);

    const minor = items.get('minor_work_permit')!;
    expect(minor.level).toBe('required');
    expect(minor.reasons[0].label).toBe('May be legally required. Verify locally.');
    expect(minor.jurisdictionSensitive).toBe(true);
    expect(minor.fulfillment).toBe('external');
    expect(minor.actions).toEqual(['upload', 'request', 'not_applicable']);

    expect(items.get('minor_release')?.level).toBe('required');
    expect(items.get('crew_deal_memo')?.status).toBe('missing');
    expect(items.get('call_sheet')).toBeDefined();
    expect(items.get('talent_release')).toBeDefined();
    expect(items.get('safety_risk_assessment')?.reasons[0].text).toBe('The project includes stunts, effects, weapons, animals, or drones.');
    expect(items.get('stunt_coordinator_plan')).toBeDefined();
    expect(items.get('vehicle_rental_agreement')?.reasons[0].label).toBe('Required by vendor');
    expect(items.get('hired_auto_coverage')).toBeDefined();
    expect(items.get('location_agreement')?.reasons[0].text).toBe('Each location should have written permission from whoever controls it.');

    // Not on public property, so no permit; a film, so no client paperwork.
    expect(items.has('film_permit')).toBe(false);
    expect(items.has('change_order')).toBe(false);
    expect(items.has('client_agreement')).toBe(false);
  });

  it('renting props recommends a COI as commonly required, never as legally required', () => {
    const coi = byId(evaluate({ profile: { rentals: { props: true } } }).items).get('certificate_of_insurance')!;
    expect(coi.level).toBe('recommended');
    expect(coi.reasons).toEqual([
      { basis: 'common', label: 'Commonly required', text: 'Rental houses usually ask for a certificate naming them as additional insured.' },
    ]);
    expect(coi.fulfillment).toBe('external');
    expect(coi.template).toBeUndefined();
    expect(coi.actions).not.toContain('use_template');
  });

  it('a venue with an unknown COI requirement asks instead of asserting', () => {
    const coi = byId(evaluate({ profile: { venue: { name: 'The Foundry' } } }).items).get('certificate_of_insurance')!;
    expect(coi.status).toBe('needs_information');
    expect(coi.level).toBe('conditional');
    expect(coi.reasons).toEqual([{ basis: 'venue', label: 'Needs information', text: 'Depends on whether the venue requires one.' }]);
  });

  it('exteriors of unknown ownership ask about a permit; nothing asks on an empty profile', () => {
    const permit = byId(evaluate({ profile: { locations: { kinds: ['exterior'] } } }).items).get('film_permit')!;
    expect(permit.status).toBe('needs_information');
    expect(evaluate({ profile: { locations: { city: 'Austin' } } }).items.map((i) => i.requirementId)).toEqual([]);
  });

  it('a venue that requires a COI makes it required by the venue', () => {
    const coi = byId(evaluate({ profile: { venue: { name: 'The Foundry', requiresCoi: true } } }).items).get('certificate_of_insurance')!;
    expect(coi.status).toBe('missing');
    expect(coi.level).toBe('required');
    expect(coi.reasons[0]).toEqual({ basis: 'venue', label: 'Required by the venue', text: 'The venue asks for a certificate before load-in.' });
  });

  it('the COI on the org account completes the requirement for every project', () => {
    const coi = byId(
      evaluate({
        profile: { rentals: { props: true } },
        accountDocuments: [{ requirementId: 'certificate_of_insurance', name: 'coi-2026.pdf' }],
      }).items,
    ).get('certificate_of_insurance')!;
    expect(coi.status).toBe('complete');
    expect(coi.document).toEqual({ name: 'coi-2026.pdf', source: 'account' });
    expect(coi.actions).toEqual(['upload']);
  });

  it('vendor requirements make a document required by that vendor, with the vendor’s reason', () => {
    const list = evaluate({
      profile: { rentals: { props: true } },
      vendorRequirements: [
        { vendorId: 'propheaven', vendorName: 'Prop Heaven', requirementId: 'w9', reason: 'Prop Heaven asks new customers for a w-9 request.' },
        { vendorId: 'omega', vendorName: 'Omega Cinema Props', requirementId: 'certificate_of_insurance', reason: 'Omega requires a certificate showing general liability of $1,000,000.' },
        { vendorId: 'omega', vendorName: 'Omega Cinema Props', requirementId: 'vendor_rental_agreement', reason: 'Omega asks new customers for a rental agreement.' },
        { vendorId: 'omega', vendorName: 'Omega Cinema Props', requirementId: 'no_such_requirement', reason: 'dropped' },
      ],
    });
    const items = byId(list.items);

    const w9 = items.get('w9')!;
    expect(w9.level).toBe('required');
    expect(w9.requiredBy).toEqual(['Prop Heaven']);
    expect(w9.reasons).toEqual([{ basis: 'vendor', label: 'Required by Prop Heaven', text: 'Prop Heaven asks new customers for a w-9 request.' }]);
    expect(w9.fulfillment).toBe('upload');
    expect(w9.actions).toEqual(['upload', 'not_applicable']);

    const coi = items.get('certificate_of_insurance')!;
    expect(coi.level).toBe('required');
    expect(coi.reasons.map((r) => r.label)).toEqual(['Required by Omega Cinema Props', 'Commonly required']);

    expect(items.get('vendor_rental_agreement')?.fulfillment).toBe('track');
    expect(items.has('no_such_requirement')).toBe(false);
  });

  it('user state overrides: attached completes, not applicable hides from open, awaiting waits', () => {
    const list = evaluate({
      profile: brooklynIndie,
      states: [
        { requirementId: 'crew_deal_memo', status: 'attached', document: { id: 'doc-1', name: 'deal-memos.pdf' } },
        { requirementId: 'talent_release', status: 'not_applicable' },
        { requirementId: 'minor_work_permit', status: 'awaiting' },
        { requirementId: 'call_sheet', status: 'attached' },
      ],
    });
    const items = byId(list.items);

    expect(items.get('crew_deal_memo')?.status).toBe('complete');
    expect(items.get('crew_deal_memo')?.document).toEqual({ id: 'doc-1', name: 'deal-memos.pdf', source: 'project' });
    expect(items.get('crew_deal_memo')?.actions).toEqual(['reset']);

    expect(items.get('talent_release')?.status).toBe('not_applicable');
    expect(items.get('talent_release')?.actions).toEqual(['reset']);

    expect(items.get('minor_work_permit')?.status).toBe('awaiting');
    expect(items.get('minor_work_permit')?.actions).toEqual(['reset', 'upload', 'not_applicable']);

    // Attached with no surviving document (deleted) is not complete.
    expect(items.get('call_sheet')?.status).toBe('missing');

    expect(list.summary.complete).toBe(1);
    expect(list.items.at(-1)?.status).toBe('not_applicable');
  });

  it('client work surfaces client paperwork; a film does not', () => {
    const commercial = byId(evaluate({ profile: { productionType: 'commercial', client: { billable: true } } }).items);
    expect(commercial.get('change_order')?.template?.id).toBe('change_order');
    expect(commercial.get('client_agreement')).toBeDefined();
    expect(commercial.get('w9')?.reasons[0].label).toBe('Commonly required');

    const film = byId(evaluate({ profile: { productionType: 'film', client: { billable: true } } }).items);
    expect(film.has('change_order')).toBe(false);
  });

  it('template access is included on the free plan during the MVP', () => {
    const item = byId(evaluate({ profile: { crew: { count: 2 } }, plan: 'free' }).items).get('crew_deal_memo')!;
    expect(item.template?.access).toEqual({ kind: 'included', via: 'plan' });
  });

  it('orders open items first, required before recommended, in category order', () => {
    const list = evaluate({ profile: brooklynIndie, states: [{ requirementId: 'call_sheet', status: 'not_applicable' }] });
    const statuses = list.items.map((i) => i.status);
    expect(statuses.indexOf('not_applicable')).toBe(statuses.length - 1);
    const open = list.items.filter((i) => i.status === 'missing');
    const levels = open.map((i) => i.level);
    expect(levels.lastIndexOf('required')).toBeLessThan(levels.indexOf('recommended'));
    expect(groupByCategory(list.items).map((g) => g.category)).toEqual(['insurance', 'vendor', 'crew', 'cast', 'location', 'safety', 'vehicles']);
  });
});

describe('advisoriesFor', () => {
  it('flags hazards and minors for professional review, never as blockers', () => {
    expect(advisoriesFor(brooklynIndie).map((a) => a.id)).toEqual(['insurance_review', 'minors_review']);
    expect(advisoriesFor({ risks: { drones: true } }).map((a) => a.id)).toEqual(['specialist_review']);
    expect(advisoriesFor({ cast: { minors: false } })).toEqual([]);
  });
});

describe('library integrity', () => {
  it('every template-fulfilled requirement names a template that exists, and ids are unique', () => {
    const ids = REQUIREMENTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REQUIREMENTS) {
      if (r.fulfillment === 'template') expect(getTemplate(r.templateId ?? '')).toBeDefined();
      for (const dep of [...(r.prerequisites ?? []), ...(r.feeds ?? [])]) expect(getRequirement(dep)).toBeDefined();
    }
  });

  it('no reason claims a legal requirement outright', () => {
    for (const r of REQUIREMENTS) {
      for (const t of r.triggers) expect(t.reason.toLowerCase()).not.toMatch(/legally required|required by law/);
      expect((r.note ?? '').toLowerCase()).not.toMatch(/legally required/);
    }
  });
});
