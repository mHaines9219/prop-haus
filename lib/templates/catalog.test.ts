import { describe, expect, it } from 'vitest';
import { EMPTY_ORDER_PROFILE } from '../order-profile';
import { TEMPLATES, TEMPLATE_FIELDS, TEMPLATE_PACKS, fieldLabel, getTemplate, prefillTemplate, templateAccess, type Template } from './catalog';

describe('template catalog', () => {
  it('every template uses only standard field ids and belongs to a pack that exists', () => {
    const packIds = new Set(TEMPLATE_PACKS.map((p) => p.id));
    for (const t of TEMPLATES) {
      for (const f of t.fields) expect(TEMPLATE_FIELDS).toContain(f);
      for (const p of t.packIds) expect(packIds.has(p)).toBe(true);
      expect(t.priceCents).toBeGreaterThan(0);
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('is included on every plan during the MVP', () => {
    const t = getTemplate('change_order')!;
    expect(templateAccess('free', t)).toEqual({ kind: 'included', via: 'plan' });
    expect(templateAccess('pro', t)).toEqual({ kind: 'included', via: 'plan' });
  });
});

describe('prefillTemplate', () => {
  it('fills the same field the same way for every template that asks for it, and lists what it cannot fill', () => {
    const src = {
      projectId: 'a1b2c3d4e5f6',
      projectName: 'Nocturne',
      profile: { productionType: 'commercial' as const, schedule: { start: '2026-10-01' }, client: { name: 'Acme' }, locations: { city: 'Brooklyn', region: 'NY' } },
      orderProfile: {
        ...EMPTY_ORDER_PROFILE,
        company: { legalName: 'Nocturne Pictures LLC', address: { line1: '1 Stage Rd', city: 'Los Angeles', state: 'CA', zip: '90028' } },
        contacts: { ordering: { name: 'Sam Reyes', email: 'sam@nocturne.example' } },
      },
    };
    const change = prefillTemplate(getTemplate('change_order')!, src);
    expect(change.data).toEqual({
      project_name: 'Nocturne',
      project_id: 'A1B2C3D4',
      production_company: 'Nocturne Pictures LLC',
      contact_name: 'Sam Reyes',
      contact_email: 'sam@nocturne.example',
      client_company: 'Acme',
      shoot_start_date: '2026-10-01',
    });
    expect(change.missing).toEqual([]);

    const agreement = prefillTemplate(getTemplate('client_agreement')!, src);
    expect(agreement.data.client_company).toBe('Acme');
    expect(agreement.data.production_type).toBe('Commercial');
    expect(agreement.data.company_address).toBe('1 Stage Rd, Los Angeles, CA 90028');
    expect(agreement.missing).toEqual(['shoot_end_date']);
  });

  const everyField: Template = { id: 'all', name: 'All', description: '', fields: TEMPLATE_FIELDS, priceCents: 1, packIds: [] };

  it('answers every standard field the profiles know', () => {
    const { data, missing } = prefillTemplate(everyField, {
      projectId: 'ffee0011aabb',
      projectName: 'Lobby',
      profile: {
        productionType: 'film',
        schedule: { start: '2026-12-01', end: '2026-12-05', shootDays: 4 },
        locations: { city: 'Los Angeles' },
        venue: { name: 'The Ambassador' },
        client: { name: 'Acme' },
        crew: { count: 0 },
        cast: { count: 6 },
      },
      orderProfile: {
        ...EMPTY_ORDER_PROFILE,
        company: { dba: 'Lobby Films', address: { line1: '9 Dock St', city: 'Burbank', state: 'CA', zip: '91502' } },
        contacts: { ordering: { name: 'Ana', email: 'ana@lobby.example', phone: '555-0100' } },
      },
    });
    expect(missing).toEqual([]);
    expect(data).toEqual({
      project_name: 'Lobby',
      project_id: 'FFEE0011',
      production_company: 'Lobby Films',
      production_type: 'Film',
      client_company: 'Acme',
      shoot_start_date: '2026-12-01',
      shoot_end_date: '2026-12-05',
      shoot_days: '4',
      location_city: 'Los Angeles',
      venue_name: 'The Ambassador',
      contact_name: 'Ana',
      contact_email: 'ana@lobby.example',
      contact_phone: '555-0100',
      company_address: '9 Dock St, Burbank, CA 91502',
      crew_count: '0',
      cast_count: '6',
    });
  });

  it('lists every field it cannot answer from an empty profile, in template order', () => {
    const { data, missing } = prefillTemplate(everyField, {
      projectId: 'ffee0011aabb',
      projectName: 'Lobby',
      profile: {},
      orderProfile: EMPTY_ORDER_PROFILE,
    });
    expect(data).toEqual({ project_name: 'Lobby', project_id: 'FFEE0011' });
    expect(missing).toEqual(TEMPLATE_FIELDS.filter((f) => f !== 'project_name' && f !== 'project_id'));
  });

  it('labels fields for humans', () => {
    expect(fieldLabel('shoot_start_date')).toBe('Shoot start date');
  });
});
