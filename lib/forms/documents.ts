/**
 * order_documents: reads, row mapping, storage paths, and the signed-copy
 * transition. Server only (service role). The builder that creates rows is
 * packet.ts.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { PAPERWORK_SIGNED_URL_SECONDS, paperworkBucket } from '@/lib/paperwork';
import { recordEvents } from '@/lib/analytics';
import { formFiller } from './filler';

export const FORM_KINDS = [
  'rental_agreement',
  'credit_application',
  'new_account',
  'coi_request',
  'w9_request',
  'other',
] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export type DocumentStatus = 'filled' | 'awaiting_signature' | 'signed' | 'manual' | 'failed' | 'skipped';

export type OrderDocument = {
  id: string;
  orgId: string;
  orderId: string;
  vendorId: string;
  vendorFormId: string | null;
  kind: FormKind;
  label: string;
  status: DocumentStatus;
  storagePath: string | null;
  signedStoragePath: string | null;
  anvilPacketEid: string | null;
  anvilDocumentGroupEid: string | null;
  signUrl: string | null;
  /** Blank-field labels ("EIN, fax") or the failure reason. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderDocumentRow = {
  id: string;
  org_id: string;
  order_id: string;
  vendor_id: string;
  vendor_form_id: string | null;
  kind: string;
  label: string;
  status: string;
  storage_path: string | null;
  signed_storage_path: string | null;
  anvil_packet_eid: string | null;
  anvil_document_group_eid: string | null;
  sign_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export function toOrderDocument(r: OrderDocumentRow): OrderDocument {
  return {
    id: r.id,
    orgId: r.org_id,
    orderId: r.order_id,
    vendorId: r.vendor_id,
    vendorFormId: r.vendor_form_id,
    kind: r.kind as FormKind,
    label: r.label,
    status: r.status as DocumentStatus,
    storagePath: r.storage_path,
    signedStoragePath: r.signed_storage_path,
    anvilPacketEid: r.anvil_packet_eid,
    anvilDocumentGroupEid: r.anvil_document_group_eid,
    signUrl: r.sign_url,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function documentStoragePath(orgId: string, orderId: string, vendorId: string, kind: string, suffix = ''): string {
  return `orgs/${orgId}/orders/${orderId}/${vendorId}/${kind}${suffix}.pdf`;
}

export { signPagePath } from './paths';

export async function listOrderDocuments(orderId: string, orgId: string): Promise<OrderDocument[]> {
  const { data, error } = await createAdminClient()
    .from('order_documents')
    .select('*')
    .eq('order_id', orderId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as OrderDocumentRow[]).map(toOrderDocument);
}

export async function getOrderDocument(id: string, orgId: string): Promise<OrderDocument | null> {
  const { data, error } = await createAdminClient()
    .from('order_documents')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? toOrderDocument(data as OrderDocumentRow) : null;
}

/** Documents still waiting on the user across an org: to sign, or manual. */
export async function countPendingDocuments(orgId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from('order_documents')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .in('status', ['awaiting_signature', 'manual']);
  return count ?? 0;
}

/** A short-lived download link: the signed copy when there is one, else the filled PDF. */
export async function documentDownloadUrl(
  id: string,
  orgId: string,
): Promise<{ url: string; name: string } | null> {
  const doc = await getOrderDocument(id, orgId);
  const path = doc?.signedStoragePath ?? doc?.storagePath;
  if (!doc || !path) return null;

  const ext = path.split('.').pop() ?? 'pdf';
  const name = `${doc.label}${doc.signedStoragePath ? ' (signed)' : ''}.${ext}`;
  const { data, error } = await createAdminClient()
    .storage.from(paperworkBucket())
    .createSignedUrl(path, PAPERWORK_SIGNED_URL_SECONDS, { download: name });
  if (error || !data?.signedUrl) throw new Error(`documentDownloadUrl: ${error?.message ?? 'no url'}`);
  return { url: data.signedUrl, name };
}

/**
 * Record that the signer finished: pull the signed copy from the provider,
 * store it beside the filled one, and flip the row. Idempotent for a row that
 * is already signed. Used by the Anvil webhook and the mock sign action.
 */
export async function markDocumentSigned(doc: OrderDocument, opts: { userId?: string | null } = {}): Promise<OrderDocument> {
  if (doc.status === 'signed') return doc;
  const db = createAdminClient();

  let signedPath = doc.storagePath;
  if (doc.anvilDocumentGroupEid) {
    const filler = await formFiller();
    const signed = await filler.downloadSigned(doc.anvilDocumentGroupEid);
    signedPath = `orgs/${doc.orgId}/orders/${doc.orderId}/${doc.vendorId}/${doc.kind}.signed.${signed.ext}`;
    const up = await db.storage
      .from(paperworkBucket())
      .upload(signedPath, signed.bytes, { contentType: signed.contentType, upsert: true });
    if (up.error) throw new Error(`signed copy upload failed: ${up.error.message}`);
  }

  const { data, error } = await db
    .from('order_documents')
    .update({
      status: 'signed',
      signed_storage_path: signedPath,
      sign_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', doc.id)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('document not found');

  await recordEvents({
    orgId: doc.orgId,
    userId: opts.userId ?? null,
    type: 'document_signed',
    payload: { orderId: doc.orderId, documentId: doc.id, vendorId: doc.vendorId, kind: doc.kind },
  });
  return toOrderDocument(data as OrderDocumentRow);
}

/** The row an Anvil packet eid belongs to, for the webhook. */
export async function findDocumentByPacket(packetEid: string): Promise<OrderDocument | null> {
  const { data, error } = await createAdminClient()
    .from('order_documents')
    .select('*')
    .eq('anvil_packet_eid', packetEid)
    .maybeSingle();
  if (error) throw error;
  return data ? toOrderDocument(data as OrderDocumentRow) : null;
}
