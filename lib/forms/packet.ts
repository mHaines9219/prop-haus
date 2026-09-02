/**
 * The paperwork packet: every vendor form on an order, filled from the org's
 * order profile and stored with the order (MVP-12).
 *
 * buildOrderPaperwork never throws. Each form becomes an order_documents row
 * whose status says what happened: filled, awaiting_signature (packet created,
 * the user signs), manual (wet signature or notary; pre-filled and handed
 * over), failed (with the reason), or skipped (the org never authorized it, or
 * the plan does not include it). Fields with no value are still left blank and
 * named on the row so the UI can say "2 fields left blank: EIN, fax".
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { paperworkBucket } from '@/lib/paperwork';
import { getOrderById, type Order } from '@/lib/orders';
import { getOrderProfile } from '@/lib/order-profile-store';
import type { OrderProfile } from '@/lib/order-profile';
import { VENDORS } from '@/lib/vendors';
import type { Source } from '@/lib/types';
import { can } from '@/lib/plans';
import type { PlanTier } from '@/lib/accounts';
import { recordEvents } from '@/lib/analytics';
import type { LogEventInput } from '@/lib/events';
import { formFiller, formsEnabled, type FormFiller } from './filler';
import { resolveFieldMap, type FieldMap, type VendorContext } from './map';
import {
  documentStoragePath,
  getOrderDocument,
  listOrderDocuments,
  signPagePath,
  toOrderDocument,
  type FormKind,
  type OrderDocument,
  type OrderDocumentRow,
} from './documents';

export type VendorForm = {
  id: string;
  vendorId: string;
  kind: FormKind;
  label: string;
  anvilTemplateEid: string | null;
  fieldMap: FieldMap;
  requiresSignature: boolean;
  mode: 'auto' | 'manual';
  notes: string | null;
};

type VendorFormRow = {
  id: string;
  vendor_id: string;
  kind: string;
  label: string;
  anvil_template_eid: string | null;
  field_map: FieldMap | null;
  requires_signature: boolean;
  mode: string;
  notes: string | null;
};

function toVendorForm(r: VendorFormRow): VendorForm {
  return {
    id: r.id,
    vendorId: r.vendor_id,
    kind: r.kind as FormKind,
    label: r.label,
    anvilTemplateEid: r.anvil_template_eid,
    fieldMap: r.field_map ?? {},
    requiresSignature: r.requires_signature,
    mode: r.mode === 'manual' ? 'manual' : 'auto',
    notes: r.notes,
  };
}

export async function listVendorForms(vendorIds: string[]): Promise<VendorForm[]> {
  if (vendorIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from('vendor_forms')
    .select('*')
    .in('vendor_id', vendorIds)
    .order('kind');
  if (error) throw error;
  return ((data ?? []) as VendorFormRow[]).map(toVendorForm);
}

async function getVendorForm(id: string): Promise<VendorForm | null> {
  const { data, error } = await createAdminClient().from('vendor_forms').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toVendorForm(data as VendorFormRow) : null;
}

/** What `$vendor.*` resolves against: the catalog entry plus the vendor's COI wording. */
async function vendorContexts(vendorIds: string[], order: Order): Promise<Record<string, VendorContext>> {
  const out: Record<string, VendorContext> = {};
  for (const id of vendorIds) {
    const known = VENDORS[id as Source];
    const fromOrder = order.items.find((i) => i.source === id)?.vendor;
    out[id] = { id, name: fromOrder ?? known?.name ?? id, website: known?.website };
  }
  if (vendorIds.length === 0) return out;

  const { data } = await createAdminClient()
    .from('vendor_insurance_minimums')
    .select('vendor_id, additional_insured_wording')
    .in('vendor_id', vendorIds);
  for (const r of (data ?? []) as Array<{ vendor_id: string; additional_insured_wording: string | null }>) {
    if (out[r.vendor_id] && r.additional_insured_wording) {
      out[r.vendor_id].additionalInsuredWording = r.additional_insured_wording;
    }
  }
  return out;
}

type FillContext = {
  order: Order;
  orgId: string;
  profile: OrderProfile;
  vendors: Record<string, VendorContext>;
  filler: FormFiller;
};

/**
 * Fill every `auto` form for every vendor on the order, and stage the `manual`
 * ones. Idempotent: a form that already has a row on this order is left alone,
 * so a checkout replay or a manual re-run never duplicates paperwork.
 */
export async function buildOrderPaperwork(
  orderId: string,
  orgId: string,
  plan: PlanTier = 'free',
): Promise<OrderDocument[]> {
  if (!formsEnabled()) return [];
  try {
    const [order, profile, existing] = await Promise.all([
      getOrderById(orderId, orgId),
      getOrderProfile(orgId),
      listOrderDocuments(orderId, orgId),
    ]);
    const vendorIds = [...new Set(order.items.map((i) => i.source as string))];
    const done = new Set(existing.map((d) => d.vendorFormId));
    const forms = (await listVendorForms(vendorIds)).filter((f) => !done.has(f.id));
    if (forms.length === 0) return existing;

    const skipReason = !profile.authorization.formsOnBehalf
      ? 'Not filled: forms are not filled until you authorize it on your order profile.'
      : !can(plan, 'paperworkGeneration')
        ? 'Not filled: paperwork generation is not included in this plan.'
        : null;

    const ctx: FillContext = {
      order,
      orgId,
      profile,
      vendors: await vendorContexts(vendorIds, order),
      filler: await formFiller(),
    };

    const rows: OrderDocument[] = [];
    for (const form of forms) {
      const id = crypto.randomUUID();
      const row = skipReason
        ? baseRow(id, ctx, form, { status: 'skipped', error: skipReason })
        : await fillOne(id, ctx, form);
      rows.push(await saveDocument(row));
    }
    await recordEvents(...rows.map((d) => documentEvent(d)));
    return [...existing, ...rows];
  } catch (err) {
    console.warn(`[forms] paperwork for order ${orderId} not built: ${(err as Error).message}`);
    return [];
  }
}

/** Re-run one document after a profile fix. Null when not this org's; throws when already signed. */
export async function refillDocument(
  documentId: string,
  orgId: string,
  plan: PlanTier = 'free',
): Promise<OrderDocument | null> {
  const doc = await getOrderDocument(documentId, orgId);
  if (!doc) return null;
  if (doc.status === 'signed') throw new Error('document already signed');

  const [order, profile] = await Promise.all([getOrderById(doc.orderId, orgId), getOrderProfile(orgId)]);
  const form = doc.vendorFormId ? await getVendorForm(doc.vendorFormId) : null;
  const ctx: FillContext = {
    order,
    orgId,
    profile,
    vendors: await vendorContexts([doc.vendorId], order),
    filler: await formFiller(),
  };

  let row: Partial<OrderDocumentRow>;
  if (!form) {
    row = baseRow(doc.id, ctx, docAsForm(doc), { status: 'failed', error: 'This form is no longer on file for the vendor.' });
  } else if (!profile.authorization.formsOnBehalf) {
    row = baseRow(doc.id, ctx, form, {
      status: 'skipped',
      error: 'Not filled: forms are not filled until you authorize it on your order profile.',
    });
  } else if (!can(plan, 'paperworkGeneration')) {
    row = baseRow(doc.id, ctx, form, { status: 'skipped', error: 'Not filled: paperwork generation is not included in this plan.' });
  } else {
    row = await fillOne(doc.id, ctx, form);
  }
  const saved = await saveDocument(row);
  await recordEvents(documentEvent(saved));
  return saved;
}

// ---- one document ----

async function fillOne(id: string, ctx: FillContext, form: VendorForm): Promise<Partial<OrderDocumentRow>> {
  const vendor = ctx.vendors[form.vendorId] ?? { id: form.vendorId, name: form.vendorId };
  const resolved = resolveFieldMap(form.fieldMap, {
    profile: ctx.profile,
    order: ctx.order,
    vendor,
    form: { kind: form.kind, label: form.label },
  });
  const blankNote =
    resolved.missing.length > 0
      ? `${resolved.missing.length} field${resolved.missing.length === 1 ? '' : 's'} left blank: ${resolved.missing.join(', ')}`
      : null;
  const title = `${form.label} · ${vendor.name}`;
  const orderRef = ctx.order.id.slice(0, 8).toUpperCase();
  const storagePath = documentStoragePath(ctx.orgId, ctx.order.id, form.vendorId, form.kind);

  let pdf: Buffer;
  try {
    pdf = await ctx.filler.fillPdf({ templateEid: form.anvilTemplateEid, title, data: resolved.data });
    const up = await createAdminClient()
      .storage.from(paperworkBucket())
      .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
  } catch (err) {
    return baseRow(id, ctx, form, { status: 'failed', error: `Fill failed: ${(err as Error).message}` });
  }

  if (form.mode === 'manual') {
    return baseRow(id, ctx, form, { status: 'manual', storage_path: storagePath, error: blankNote });
  }
  if (!form.requiresSignature) {
    return baseRow(id, ctx, form, { status: 'filled', storage_path: storagePath, error: blankNote });
  }

  const signer = ctx.profile.contacts.ordering;
  if (!signer?.name || !signer.email) {
    return baseRow(id, ctx, form, {
      status: 'failed',
      storage_path: storagePath,
      error: 'Filled, but no ordering contact on the profile to sign it.',
    });
  }
  try {
    const packet = await ctx.filler.createSignaturePacket({
      templateEid: form.anvilTemplateEid,
      pdf,
      signer: { name: signer.name, email: signer.email },
      signerFields: resolved.signerFields,
      data: resolved.data,
      title,
      orderRef,
      mockSignPath: signPagePath(ctx.order.id, id),
    });
    return baseRow(id, ctx, form, {
      status: 'awaiting_signature',
      storage_path: storagePath,
      anvil_packet_eid: packet.packetEid,
      anvil_document_group_eid: packet.documentGroupEid,
      sign_url: packet.signUrl ?? signPagePath(ctx.order.id, id),
      error: blankNote,
    });
  } catch (err) {
    return baseRow(id, ctx, form, {
      status: 'failed',
      storage_path: storagePath,
      error: `Filled, but the signature request failed: ${(err as Error).message}`,
    });
  }
}

function baseRow(
  id: string,
  ctx: FillContext,
  form: Pick<VendorForm, 'id' | 'vendorId' | 'kind' | 'label'>,
  over: Partial<OrderDocumentRow>,
): Partial<OrderDocumentRow> {
  return {
    id,
    org_id: ctx.orgId,
    order_id: ctx.order.id,
    vendor_id: form.vendorId,
    vendor_form_id: form.id,
    kind: form.kind,
    label: form.label,
    storage_path: null,
    signed_storage_path: null,
    anvil_packet_eid: null,
    anvil_document_group_eid: null,
    sign_url: null,
    error: null,
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function docAsForm(doc: OrderDocument): Pick<VendorForm, 'id' | 'vendorId' | 'kind' | 'label'> {
  return { id: doc.vendorFormId ?? '', vendorId: doc.vendorId, kind: doc.kind, label: doc.label };
}

async function saveDocument(row: Partial<OrderDocumentRow>): Promise<OrderDocument> {
  const { data, error } = await createAdminClient()
    .from('order_documents')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('order_documents upsert returned nothing');
  return toOrderDocument(data as OrderDocumentRow);
}

function documentEvent(d: OrderDocument): LogEventInput {
  const base = { orderId: d.orderId, documentId: d.id, vendorId: d.vendorId, kind: d.kind };
  if (d.status === 'failed') {
    return { orgId: d.orgId, type: 'document_failed', payload: { ...base, error: d.error } };
  }
  return { orgId: d.orgId, type: 'document_filled', payload: { ...base, status: d.status, missing: d.error } };
}
