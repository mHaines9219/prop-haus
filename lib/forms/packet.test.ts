import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { READY_PROFILE, orderItemRow, orderRow } from '@/test/fixtures/orders';
import type { OrderProfile } from '@/lib/order-profile';
import { PLAN_ENTITLEMENTS } from '@/lib/plans';
import { MockFormFiller } from './filler';
import { buildOrderPaperwork, listVendorForms, refillDocument } from './packet';

const AUTH_REASON = 'Not filled: forms are not filled until you authorize it on your order profile.';
const PLAN_REASON = 'Not filled: paperwork generation is not included in this plan.';

function formRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'form-ra',
    vendor_id: 'omega',
    kind: 'rental_agreement',
    label: 'Rental agreement',
    anvil_template_eid: 'tmpl-ra',
    field_map: {
      companyName: 'company.legalName',
      start: '$order.rentalStart',
      fax: 'company.fax',
      aiWording: '$vendor.additionalInsuredWording',
      signature: '$signer.signature',
    },
    requires_signature: true,
    mode: 'auto',
    notes: null,
    ...over,
  };
}

const FORMS = [
  formRow(),
  formRow({ id: 'form-coi', kind: 'coi_request', label: 'COI request', anvil_template_eid: null, requires_signature: false, field_map: { companyName: 'company.legalName', carrier: 'insurance.carrier' } }),
  formRow({ id: 'form-credit', kind: 'credit_application', label: 'Credit application', requires_signature: true, mode: 'manual', field_map: { companyName: 'company.legalName' } }),
  formRow({ id: 'form-elsewhere', vendor_id: 'eclectic', label: 'Not on this order' }),
];

function seedOrder() {
  db.relation('orders', 'order_items', 'order_id');
  db.seed('orders', [orderRow(), orderRow({ id: 'theirs', org_id: OTHER_ORG_ID, idempotency_key: 'idem-x' })]);
  db.seed('order_items', [orderItemRow(), orderItemRow({ id: 'oi-2', item_id: 'omega-2', name: 'Brass lamp' })]);
  db.seed('vendor_insurance_minimums', [{ vendor_id: 'omega', additional_insured_wording: 'Omega, its officers and agents' }]);
}

function seedProfile(profile: OrderProfile = READY_PROFILE) {
  db.rows('organizations').length = 0;
  db.seed('organizations', [{ id: ORG_ID, order_profile: profile }]);
}

const docs = () => db.rows('order_documents');
const doc = (formId: string) => docs().find((r) => r.vendor_form_id === formId)!;
const pdfText = (path: unknown) => Buffer.from(db.bucket('paperwork').get(path as string)!.bytes).toString('latin1');
const filePath = (formId: string) => `orgs/${ORG_ID}/orders/order-1/omega/${doc(formId).kind}.${doc(formId).id}.pdf`;

beforeAll(() => {
  delete process.env.FORMS_PROVIDER;
  delete process.env.PAPERWORK_BUCKET;
});

beforeEach(() => {
  delete process.env.FORMS;
  db.reset();
  seedOrder();
  seedProfile();
  db.seed('vendor_forms', FORMS);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FORMS;
});

describe('listVendorForms', () => {
  it('returns the forms on file for the given vendors in app shape', async () => {
    const forms = await listVendorForms(['omega']);
    expect(forms.map((f) => f.id)).toEqual(['form-coi', 'form-credit', 'form-ra']);
    expect(forms[1]).toEqual({
      id: 'form-credit',
      vendorId: 'omega',
      kind: 'credit_application',
      label: 'Credit application',
      anvilTemplateEid: 'tmpl-ra',
      fieldMap: { companyName: 'company.legalName' },
      requiresSignature: true,
      mode: 'manual',
      notes: null,
    });
  });

  it('reads an unknown mode as auto and a missing field map as empty', async () => {
    db.seed('vendor_forms', [formRow({ id: 'odd', vendor_id: 'odd', mode: 'weird', field_map: null })]);
    const [form] = await listVendorForms(['odd']);
    expect(form).toMatchObject({ mode: 'auto', fieldMap: {} });
  });

  it('is empty for no vendors, without a query', async () => {
    expect(await listVendorForms([])).toEqual([]);
    expect(db.log).toEqual([]);
  });

  it('throws on a database error', async () => {
    db.failNext('vendor_forms', 'select', 'boom');
    await expect(listVendorForms(['omega'])).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('buildOrderPaperwork', () => {
  it('fills every form for the order’s vendors and stages what needs the user', async () => {
    const out = await buildOrderPaperwork('order-1', ORG_ID);

    expect(out.map((d) => [d.vendorFormId, d.status])).toEqual([
      ['form-coi', 'filled'],
      ['form-credit', 'manual'],
      ['form-ra', 'awaiting_signature'],
    ]);
    expect(docs()).toHaveLength(3);
    expect(docs().every((r) => r.org_id === ORG_ID && r.order_id === 'order-1')).toBe(true);
    expect(docs().some((r) => r.vendor_form_id === 'form-elsewhere')).toBe(false);

    expect(doc('form-coi')).toMatchObject({ storage_path: filePath('form-coi'), error: '1 field left blank: Carrier', sign_url: null });
    expect(doc('form-credit')).toMatchObject({ storage_path: filePath('form-credit'), error: null, anvil_packet_eid: null });
    expect(doc('form-ra')).toMatchObject({
      storage_path: filePath('form-ra'),
      error: '1 field left blank: Fax',
      anvil_packet_eid: expect.stringMatching(/^mock-packet-/),
      anvil_document_group_eid: expect.stringMatching(/^mock-group-/),
      sign_url: `/orders/order-1/sign/${doc('form-ra').id}?mock=1`,
      signed_storage_path: null,
    });
  });

  it('stores a PDF for each form, filled from the profile, order and vendor', async () => {
    await buildOrderPaperwork('order-1', ORG_ID);
    expect([...db.bucket('paperwork').keys()].sort()).toEqual(
      [filePath('form-coi'), filePath('form-credit'), filePath('form-ra')].sort(),
    );
    const ra = pdfText(filePath('form-ra'));
    expect(ra).toContain('Rental agreement');
    expect(ra).toContain('Omega Cinema Props');
    expect(ra).toContain('companyName: Nocturne Pictures LLC');
    expect(ra).toContain('start: 09/07/2026');
    expect(ra).toContain('aiWording: Omega, its officers and agents');
    expect(db.bucket('paperwork').get(filePath('form-ra'))!.contentType).toBe('application/pdf');
  });

  it('never fills a signature: signer fields go to the user’s e-sign session', async () => {
    const fill = vi.spyOn(MockFormFiller.prototype, 'fillPdf');
    const sign = vi.spyOn(MockFormFiller.prototype, 'createSignaturePacket');
    await buildOrderPaperwork('order-1', ORG_ID);

    for (const [input] of fill.mock.calls) expect(Object.keys(input.data)).not.toContain('signature');
    expect(pdfText(filePath('form-ra'))).not.toContain('signature:');
    expect(fill).toHaveBeenCalledWith(expect.objectContaining({ templateEid: 'tmpl-ra', title: 'Rental agreement · Omega Cinema Props' }));

    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0][0]).toMatchObject({
      templateEid: 'tmpl-ra',
      signer: { name: 'Sam Reyes', email: 'sam@nocturne.example' },
      signerFields: ['signature'],
      orderRef: 'ORDER-1',
      title: 'Rental agreement · Omega Cinema Props',
    });
    expect(sign.mock.calls[0][0].data).not.toHaveProperty('signature');
    expect(Buffer.isBuffer(sign.mock.calls[0][0].pdf)).toBe(true);
  });

  it('records one event per document', async () => {
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(db.rows('events').map((e) => [e.type, (e.payload as { status: string }).status])).toEqual([
      ['document_filled', 'filled'],
      ['document_filled', 'manual'],
      ['document_filled', 'awaiting_signature'],
    ]);
    expect(db.rows('events')[0].payload).toMatchObject({ orderId: 'order-1', vendorId: 'omega', kind: 'coi_request', missing: '1 field left blank: Carrier' });
  });

  it('is idempotent: a second run adds no rows and no events', async () => {
    const first = await buildOrderPaperwork('order-1', ORG_ID);
    const second = await buildOrderPaperwork('order-1', ORG_ID);
    expect(docs()).toHaveLength(3);
    expect(db.rows('events')).toHaveLength(3);
    expect(second.map((d) => d.id).sort()).toEqual(first.map((d) => d.id).sort());
  });

  it('fills only forms added since the last run', async () => {
    await buildOrderPaperwork('order-1', ORG_ID);
    db.seed('vendor_forms', [formRow({ id: 'form-w9', kind: 'w9_request', label: 'W-9 request', requires_signature: false, field_map: {} })]);
    const out = await buildOrderPaperwork('order-1', ORG_ID);
    expect(out).toHaveLength(4);
    expect(docs()).toHaveLength(4);
    expect(doc('form-w9').status).toBe('filled');
  });

  it('keeps two forms of the same kind for one vendor in separate files', async () => {
    db.rows('vendor_forms').length = 0;
    db.seed('vendor_forms', [
      formRow({ id: 'form-a', kind: 'other', label: 'Damage waiver', requires_signature: false, field_map: {} }),
      formRow({ id: 'form-b', kind: 'other', label: 'Studio access form', requires_signature: false, field_map: {} }),
    ]);
    await buildOrderPaperwork('order-1', ORG_ID);
    const a = doc('form-a').storage_path;
    const b = doc('form-b').storage_path;
    expect(a).not.toBe(b);
    expect(pdfText(a)).toContain('Damage waiver');
    expect(pdfText(b)).toContain('Studio access form');
  });

  it('pluralizes several blank fields', async () => {
    db.rows('vendor_forms').length = 0;
    db.seed('vendor_forms', [formRow({ requires_signature: false, field_map: { fax: 'company.fax', taxId: 'company.taxId' } })]);
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(doc('form-ra').error).toBe('2 fields left blank: Fax, Tax id');
  });

  it('skips every form, filling nothing, until the org authorizes it', async () => {
    seedProfile({ ...READY_PROFILE, authorization: { formsOnBehalf: false } });
    const fill = vi.spyOn(MockFormFiller.prototype, 'fillPdf');
    const out = await buildOrderPaperwork('order-1', ORG_ID);
    expect(out.map((d) => d.status)).toEqual(['skipped', 'skipped', 'skipped']);
    expect(docs().every((r) => r.error === AUTH_REASON && r.storage_path === null)).toBe(true);
    expect(fill).not.toHaveBeenCalled();
    expect(db.bucket('paperwork').size).toBe(0);
  });

  it('skips every form when the plan does not include paperwork', async () => {
    const free = PLAN_ENTITLEMENTS.free;
    vi.spyOn(PLAN_ENTITLEMENTS, 'free', 'get').mockReturnValue({ ...free, paperworkGeneration: false });
    const out = await buildOrderPaperwork('order-1', ORG_ID, 'free');
    expect(out.map((d) => [d.status, d.error])).toEqual(Array(3).fill(['skipped', PLAN_REASON]));
    expect(db.bucket('paperwork').size).toBe(0);
  });

  it('fails a form that needs a signature when the profile has no ordering contact', async () => {
    seedProfile({ ...READY_PROFILE, contacts: {} });
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(doc('form-ra')).toMatchObject({
      status: 'failed',
      storage_path: filePath('form-ra'),
      error: 'Filled, but no ordering contact on the profile to sign it.',
      anvil_packet_eid: null,
    });
    expect(doc('form-coi').status).toBe('filled');
    expect(db.rows('events').find((e) => e.type === 'document_failed')?.payload).toMatchObject({
      vendorId: 'omega',
      kind: 'rental_agreement',
      error: 'Filled, but no ordering contact on the profile to sign it.',
    });
  });

  it('fails one form whose PDF cannot be stored and fills the rest', async () => {
    db.failNextStorage('upload', 'bucket full');
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(doc('form-coi')).toMatchObject({ status: 'failed', storage_path: null, error: 'Fill failed: upload failed: bucket full' });
    expect(doc('form-credit').status).toBe('manual');
  });

  it('fails a form the filler cannot fill', async () => {
    vi.spyOn(MockFormFiller.prototype, 'fillPdf').mockRejectedValueOnce(new Error('template missing'));
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(doc('form-coi')).toMatchObject({ status: 'failed', error: 'Fill failed: template missing', storage_path: null });
  });

  it('keeps the filled PDF when the signature request fails', async () => {
    vi.spyOn(MockFormFiller.prototype, 'createSignaturePacket').mockRejectedValueOnce(new Error('etch down'));
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(doc('form-ra')).toMatchObject({
      status: 'failed',
      storage_path: filePath('form-ra'),
      error: 'Filled, but the signature request failed: etch down',
      sign_url: null,
    });
  });

  it('falls back to the mock sign page when the filler returns no sign link', async () => {
    vi.spyOn(MockFormFiller.prototype, 'createSignaturePacket').mockResolvedValueOnce({ packetEid: 'p', documentGroupEid: 'g' });
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(doc('form-ra').sign_url).toBe(`/orders/order-1/sign/${doc('form-ra').id}`);
  });

  it('does nothing when forms are switched off', async () => {
    process.env.FORMS = 'off';
    expect(await buildOrderPaperwork('order-1', ORG_ID)).toEqual([]);
    expect(db.log).toEqual([]);
  });

  it('returns what is on file when the vendors have no forms', async () => {
    db.rows('vendor_forms').length = 0;
    expect(await buildOrderPaperwork('order-1', ORG_ID)).toEqual([]);
    expect(db.rows('events')).toEqual([]);
  });

  it('builds nothing for another org’s order and never throws', async () => {
    expect(await buildOrderPaperwork('theirs', ORG_ID)).toEqual([]);
    expect(docs()).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[forms] paperwork for order theirs not built'));
  });

  it('returns nothing and warns when a row cannot be saved', async () => {
    db.failNext('order_documents', 'upsert', 'disk full');
    expect(await buildOrderPaperwork('order-1', ORG_ID)).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });

  it('names the vendor from the catalog when the order does not', async () => {
    db.rows('order_items').forEach((r) => (r.vendor = undefined));
    const fill = vi.spyOn(MockFormFiller.prototype, 'fillPdf');
    await buildOrderPaperwork('order-1', ORG_ID);
    expect(fill.mock.calls[0][0].title).toMatch(/^COI request · (?!omega$).+/);
  });
});

describe('refillDocument', () => {
  async function failedRa() {
    seedProfile({ ...READY_PROFILE, contacts: {} });
    await buildOrderPaperwork('order-1', ORG_ID);
    seedProfile();
    return doc('form-ra').id as string;
  }

  it('re-runs one document in place after a profile fix', async () => {
    const id = await failedRa();
    const path = doc('form-ra').storage_path;
    const out = await refillDocument(id, ORG_ID);
    expect(doc('form-ra').storage_path).toBe(path);
    expect(db.bucket('paperwork').size).toBe(3);
    expect(out).toMatchObject({ id, status: 'awaiting_signature', error: '1 field left blank: Fax' });
    expect(docs()).toHaveLength(3);
    expect(doc('form-ra')).toMatchObject({ id, status: 'awaiting_signature', sign_url: `/orders/order-1/sign/${id}?mock=1` });
    expect(db.rows('events').at(-1)).toMatchObject({ type: 'document_filled', payload: expect.objectContaining({ documentId: id }) });
  });

  it('is null for another org’s document', async () => {
    const id = await failedRa();
    expect(await refillDocument(id, OTHER_ORG_ID)).toBeNull();
    expect(doc('form-ra').status).toBe('failed');
  });

  it('refuses a signed document', async () => {
    const id = await failedRa();
    doc('form-ra').status = 'signed';
    await expect(refillDocument(id, ORG_ID)).rejects.toThrow('document already signed');
  });

  it('fails a document whose form is no longer on file', async () => {
    const id = await failedRa();
    db.rows('vendor_forms').splice(db.rows('vendor_forms').findIndex((r) => r.id === 'form-ra'), 1);
    const out = await refillDocument(id, ORG_ID);
    expect(out).toMatchObject({ status: 'failed', error: 'This form is no longer on file for the vendor.', storagePath: null });
    expect(db.rows('events').at(-1)?.type).toBe('document_failed');
  });

  it('skips when the org has withdrawn authorization', async () => {
    const id = await failedRa();
    seedProfile({ ...READY_PROFILE, authorization: { formsOnBehalf: false } });
    expect(await refillDocument(id, ORG_ID)).toMatchObject({ status: 'skipped', error: AUTH_REASON });
  });

  it('skips when the plan does not include paperwork', async () => {
    const id = await failedRa();
    const free = PLAN_ENTITLEMENTS.free;
    vi.spyOn(PLAN_ENTITLEMENTS, 'free', 'get').mockReturnValue({ ...free, paperworkGeneration: false });
    expect(await refillDocument(id, ORG_ID, 'free')).toMatchObject({ status: 'skipped', error: PLAN_REASON });
  });
});
