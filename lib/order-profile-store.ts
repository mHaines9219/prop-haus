/**
 * Reads and writes for the org's order profile, plus the COI on file. Server
 * only: this is the service-role client. The pure half is order-profile.ts.
 */

import { createAdminClient } from './supabase/admin';
import { PAPERWORK_SIGNED_URL_SECONDS, checkPaperworkFile, paperworkBucket } from './paperwork';
import {
  EMPTY_ORDER_PROFILE,
  normalizeOrderProfile,
  type CoiDocument,
  type OrderProfile,
} from './order-profile';

export async function getOrderProfile(orgId: string): Promise<OrderProfile> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('organizations')
    .select('order_profile')
    .eq('id', orgId)
    .single();
  if (error || !data) return EMPTY_ORDER_PROFILE;
  return normalizeOrderProfile((data as { order_profile: unknown }).order_profile);
}

export async function updateOrderProfile(orgId: string, profile: OrderProfile): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from('organizations')
    .update({ order_profile: profile, updated_at: new Date().toISOString() })
    .eq('id', orgId);
  if (error) throw error;
}

// ---- the COI on file ----

export type StoreCoiResult =
  | { ok: true; document: CoiDocument }
  | { ok: false; status: 400 | 500; error: string };

/**
 * Store the production's own COI and point the profile at it. Only a PDF or an
 * image is accepted — a COI is a certificate, not a spreadsheet. The object
 * path starts with the org id, matching the paperwork bucket's RLS convention.
 * A replaced COI leaves the old object in place; cleanup is not done here.
 */
export async function storeCoiDocument(
  orgId: string,
  file: { name: string; mime: string; bytes: Uint8Array },
): Promise<StoreCoiResult> {
  const check = checkPaperworkFile({ name: file.name, mime: file.mime, size: file.bytes.byteLength });
  if (!check.ok) return { ok: false, status: 400, error: check.reason };
  if (check.mime !== 'application/pdf' && !check.mime.startsWith('image/')) {
    return { ok: false, status: 400, error: 'Upload the certificate as a PDF or an image.' };
  }

  const storagePath = `${orgId}/coi/${crypto.randomUUID()}.${check.ext}`;
  const up = await createAdminClient()
    .storage.from(paperworkBucket())
    .upload(storagePath, file.bytes, { contentType: check.mime, upsert: false });
  if (up.error) return { ok: false, status: 500, error: `upload failed: ${up.error.message}` };

  const document: CoiDocument = { storagePath, name: check.name, uploadedAt: new Date().toISOString() };
  const profile = await getOrderProfile(orgId);
  await updateOrderProfile(orgId, {
    ...profile,
    insurance: { ...profile.insurance, coiDocument: document },
  });
  return { ok: true, document };
}

/** A short-lived signed download URL for the COI on file, or null when there is none. */
export async function coiDownloadUrl(orgId: string): Promise<{ url: string; name: string } | null> {
  const doc = (await getOrderProfile(orgId)).insurance.coiDocument;
  if (!doc) return null;

  const { data, error } = await createAdminClient()
    .storage.from(paperworkBucket())
    .createSignedUrl(doc.storagePath, PAPERWORK_SIGNED_URL_SECONDS, { download: doc.name });
  if (error || !data?.signedUrl) throw new Error(`coiDownloadUrl: ${error?.message ?? 'no url'}`);
  return { url: data.signedUrl, name: doc.name };
}
