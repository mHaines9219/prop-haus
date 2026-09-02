import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/test/helpers/fake-supabase';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { attachTemplate, attachUpload, buildChecklist, listRequirementStates, projectVendorIds, setRequirementStatus } from './store';

/**
 * The checklist store against the in-memory database: the profile, the
 * vendors on the pull, the org's COI, and the user's state all reach the
 * engine; every action is org-gated and leaves the row and the bytes agreeing.
 */

const T = '2026-09-01T00:00:00.000Z';
const P = 'proj-1';

function seedProject(id = P, org = ORG_ID, profile: Row = {}) {
  db.seed('projects', [{ id, org_id: org, name: `Project ${id}`, created_at: T, updated_at: T, archived_at: null, profile }]);
  db.seed('project_folders', [
    { id: `${id}-scene`, project_id: id, name: 'Scene 1', kind: 'scene', position: 0, created_at: T, updated_at: T },
    { id: `${id}-paper`, project_id: id, name: 'Paperwork', kind: 'paperwork', position: 0, created_at: T, updated_at: T },
  ]);
}

function seedItem(projectId: string, source: string, itemId: string) {
  db.seed('project_items', [
    { project_id: projectId, folder_id: `${projectId}-scene`, item_id: itemId, source, source_id: itemId, name: itemId, source_url: 'https://x.example', added_at: T, metadata: {} },
  ]);
}

beforeEach(() => {
  db.reset();
  db.relation('projects', 'project_folders', 'project_id');
  db.relation('project_folders', 'project_items', 'folder_id');
  db.relation('project_folders', 'project_documents', 'folder_id');
  db.relation('project_documents', 'project_requirements', 'document_id');
  db.unique('project_requirements', ['project_id', 'requirement_id']);
  process.env.FORMS_PROVIDER = 'mock';
});

describe('buildChecklist', () => {
  it('is null for a project the org does not own', async () => {
    seedProject(P, OTHER_ORG_ID, { crew: { count: 3 } });
    expect(await buildChecklist(ORG_ID, P)).toBeNull();
  });

  it('runs the engine on the stored profile with the vendors on the pull and the COI on file', async () => {
    seedProject(P, ORG_ID, { rentals: { props: true } });
    seedItem(P, 'omega', 'omega-1');
    seedItem(P, 'omega', 'omega-2');
    seedItem(P, 'propheaven', 'ph-1');
    seedItem(P, 'clip', 'clip-1');
    db.seed('vendor_forms', [
      { vendor_id: 'omega', kind: 'rental_agreement', label: 'Rental agreement', field_map: {}, requires_signature: true, mode: 'auto', notes: null },
      { vendor_id: 'propheaven', kind: 'w9_request', label: 'W-9 request', field_map: {}, requires_signature: false, mode: 'auto', notes: null },
    ]);
    db.seed('vendor_insurance_minimums', [
      { vendor_id: 'omega', vendor_name: 'Omega Cinema Props', gl_limit: 2_000_000, aggregate_limit: 2_000_000, workers_comp_required: false, additional_insured_required: true, notes: null },
    ]);
    db.seed('organizations', [
      {
        id: ORG_ID,
        order_profile: {
          insurance: { glLimit: 1_000_000, aggregateLimit: 2_000_000, additionalInsuredAvailable: true, coiDocument: { storagePath: 'x', name: 'coi.pdf', uploadedAt: T } },
          authorization: { formsOnBehalf: true },
        },
      },
    ]);

    const built = await buildChecklist(ORG_ID, P);
    expect(built).not.toBeNull();
    const items = new Map(built!.checklist.items.map((i) => [i.requirementId, i]));

    const coi = items.get('certificate_of_insurance')!;
    expect(coi.status).toBe('complete');
    expect(coi.document).toEqual({ name: 'coi.pdf', source: 'account' });
    expect(coi.requiredBy).toEqual(['Omega Cinema Props']);

    expect(items.get('w9')?.requiredBy).toEqual(['Prop Heaven']);
    expect(items.get('vendor_rental_agreement')?.requiredBy).toEqual(['Omega Cinema Props']);
    expect(items.get('prop_inventory_condition_log')?.status).toBe('missing');

    expect(built!.checklist.advisories).toEqual([
      { id: 'insurance_gap:omega', text: 'Omega Cinema Props: GL limit too low: org has $1,000,000, vendor requires $2,000,000.' },
    ]);
    expect(projectVendorIds(built!.project)).toEqual(['omega', 'propheaven']);
  });
});

describe('actions', () => {
  it('marks requested, not applicable, and undoes, org-gated and only for known requirements', async () => {
    seedProject(P, ORG_ID, { cast: { minors: true } });

    const requested = await setRequirementStatus(ORG_ID, P, 'minor_work_permit', 'request');
    expect(requested.ok).toBe(true);
    if (requested.ok) expect(requested.checklist.items.find((i) => i.requirementId === 'minor_work_permit')?.status).toBe('awaiting');

    const na = await setRequirementStatus(ORG_ID, P, 'minor_work_permit', 'not_applicable');
    if (na.ok) expect(na.checklist.items.find((i) => i.requirementId === 'minor_work_permit')?.status).toBe('not_applicable');
    expect(db.rows('project_requirements')).toHaveLength(1);

    const reset = await setRequirementStatus(ORG_ID, P, 'minor_work_permit', 'reset');
    if (reset.ok) expect(reset.checklist.items.find((i) => i.requirementId === 'minor_work_permit')?.status).toBe('missing');
    expect(db.rows('project_requirements')).toHaveLength(0);

    expect(await setRequirementStatus(OTHER_ORG_ID, P, 'minor_work_permit', 'request')).toEqual({ ok: false, status: 404, error: 'not found' });
    expect(await setRequirementStatus(ORG_ID, P, 'nope', 'request')).toEqual({ ok: false, status: 404, error: 'unknown requirement' });
    expect(db.rows('events').map((e) => e.type)).toEqual(['requirement_status_changed', 'requirement_status_changed', 'requirement_status_changed']);
  });

  it('attaches an upload: bytes in the bucket, row in the paperwork folder, state linked', async () => {
    seedProject(P, ORG_ID, { client: { billable: true }, productionType: 'commercial' });

    const result = await attachUpload(ORG_ID, P, 'w9', { name: 'w9.pdf', mime: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) });
    expect(result.ok).toBe(true);
    const docs = db.rows('project_documents');
    expect(docs).toHaveLength(1);
    expect(docs[0].folder_id).toBe(`${P}-paper`);
    expect(db.bucket('paperwork').has(docs[0].storage_path as string)).toBe(true);

    const states = await listRequirementStates(P);
    expect(states).toEqual([{ requirementId: 'w9', status: 'attached', document: { id: docs[0].id, name: 'w9.pdf' } }]);
    if (result.ok) expect(result.checklist.items.find((i) => i.requirementId === 'w9')?.status).toBe('complete');
  });

  it('refuses a bad upload before touching storage', async () => {
    seedProject(P);
    const result = await attachUpload(ORG_ID, P, 'w9', { name: 'w9.exe', mime: 'application/x-msdownload', bytes: new Uint8Array([1]) });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(db.bucket('paperwork').size).toBe(0);
    expect(db.rows('project_requirements')).toHaveLength(0);
  });

  it('fills a template from the project and org profiles, stores it, attaches it, and names the blanks', async () => {
    seedProject(P, ORG_ID, { productionType: 'commercial', client: { billable: true, name: 'Acme' }, schedule: { start: '2026-10-01' } });
    db.seed('organizations', [{ id: ORG_ID, order_profile: { company: { legalName: 'Nocturne Pictures LLC' }, contacts: { ordering: { name: 'Sam', email: 's@x.example' } } } }]);

    const result = await attachTemplate(ORG_ID, P, 'change_order');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missing).toEqual([]);

    const doc = db.rows('project_documents')[0];
    expect(doc.name).toBe('change_order.pdf');
    expect(doc.mime).toBe('application/pdf');
    const bytes = db.bucket('paperwork').get(doc.storage_path as string)!.bytes;
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(new TextDecoder().decode(bytes)).toContain('Acme');

    expect(result.checklist.items.find((i) => i.requirementId === 'change_order')).toMatchObject({
      status: 'complete',
      document: { id: doc.id, name: 'change_order.pdf', source: 'project' },
    });
    expect(db.rows('events').at(-1)).toMatchObject({ type: 'template_used', payload: { templateId: 'change_order', missing: [] } });
  });

  it('reports the fields it could not fill', async () => {
    seedProject(P, ORG_ID, { crew: { count: 4 } });
    const result = await attachTemplate(ORG_ID, P, 'crew_deal_memo');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.missing).toEqual(['production_company', 'contact_name', 'contact_email', 'production_type', 'shoot_start_date', 'shoot_end_date', 'location_city']);
  });

  it('has no template for an external document and nothing for another org', async () => {
    seedProject(P, ORG_ID, { cast: { minors: true } });
    expect(await attachTemplate(ORG_ID, P, 'minor_work_permit')).toEqual({ ok: false, status: 404, error: 'no template for this requirement' });
    expect(await attachTemplate(OTHER_ORG_ID, P, 'minor_release')).toEqual({ ok: false, status: 404, error: 'not found' });
    expect(db.rows('project_documents')).toHaveLength(0);
  });
});
