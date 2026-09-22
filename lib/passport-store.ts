/**
 * Reads, writes, and storage for the passport. Server only (service role).
 * The COI kind is routed to the order profile so the certificate has one home.
 */

import { createAdminClient } from './supabase/admin';
import { PAPERWORK_SIGNED_URL_SECONDS, checkPaperworkFile, paperworkBucket } from './paperwork';
import {
  EMPTY_PASSPORT,
  PASSPORT_KIND_SPECS,
  normalizePassport,
  resolvePassport,
  type Passport,
  type PassportDocument,
  type PassportDocumentPatch,
  type PassportKind,
} from './passport';
import { coiDownloadUrl, getOrderProfile, storeCoiDocument, updateOrderProfile } from './order-profile-store';

/** The passport as the wallet shows it: stored slots plus the COI from the order profile. */
export async function getPassport(orgId: string): Promise<Passport> {
  const [stored, profile] = await Promise.all([getStoredPassport(orgId), getOrderProfile(orgId)]);
  return resolvePassport(stored, profile);
}

async function getStoredPassport(orgId: string): Promise<Passport> {
  const { data, error } = await createAdminClient()
    .from('organizations')
    .select('passport')
    .eq('id', orgId)
    .single();
  if (error || !data) return EMPTY_PASSPORT;
  return normalizePassport((data as { passport: unknown }).passport);
}

async function updateStoredPassport(orgId: string, passport: Passport): Promise<void> {
  const { error } = await createAdminClient()
    .from('organizations')
    .update({ passport, updated_at: new Date().toISOString() })
    .eq('id', orgId);
  if (error) throw error;
}

export type StorePassportResult =
  | { ok: true; document: PassportDocument }
  | { ok: false; status: 400 | 500; error: string };

/**
 * Store a document in a slot and point the passport at it. The object path
 * starts with the org id, matching the paperwork bucket's RLS convention. A
 * replaced document leaves the old object in place; cleanup is not done here.
 */
export async function storePassportDocument(
  orgId: string,
  kind: PassportKind,
  file: { name: string; mime: string; bytes: Uint8Array },
  uploadedByUserId?: string,
): Promise<StorePassportResult> {
  if (kind === 'coi') {
    const result = await storeCoiDocument(orgId, file);
    if (!result.ok) return result;
    const passport = await getPassport(orgId);
    return { ok: true, document: passport.documents.coi! };
  }

  const check = checkPaperworkFile({ name: file.name, mime: file.mime, size: file.bytes.byteLength });
  if (!check.ok) return { ok: false, status: 400, error: check.reason };
  if (
    PASSPORT_KIND_SPECS[kind].pdfOrImageOnly &&
    check.mime !== 'application/pdf' &&
    !check.mime.startsWith('image/')
  ) {
    return { ok: false, status: 400, error: 'Upload this document as a PDF or an image.' };
  }

  const storagePath = `${orgId}/passport/${crypto.randomUUID()}.${check.ext}`;
  const up = await createAdminClient()
    .storage.from(paperworkBucket())
    .upload(storagePath, file.bytes, { contentType: check.mime, upsert: false });
  if (up.error) return { ok: false, status: 500, error: `upload failed: ${up.error.message}` };

  const stored = await getStoredPassport(orgId);
  const previous = stored.documents[kind];
  const document: PassportDocument = {
    storagePath,
    name: check.name,
    mime: check.mime,
    uploadedAt: new Date().toISOString(),
    ...(uploadedByUserId ? { uploadedByUserId } : {}),
    ...(previous?.expiresAt ? { expiresAt: previous.expiresAt } : {}),
    ...(previous?.reference ? { reference: previous.reference } : {}),
  };
  await updateStoredPassport(orgId, { documents: { ...stored.documents, [kind]: document } });
  return { ok: true, document };
}

/** Update expiry and reference on a slot that has a document. Null when the slot is empty. */
export async function patchPassportDocument(
  orgId: string,
  kind: PassportKind,
  patch: PassportDocumentPatch,
): Promise<PassportDocument | null> {
  if (kind === 'coi') {
    const profile = await getOrderProfile(orgId);
    if (!profile.insurance.coiDocument) return null;
    const insurance = { ...profile.insurance, expiresAt: patch.expiresAt, policyNumber: patch.reference };
    if (!patch.expiresAt) delete insurance.expiresAt;
    if (!patch.reference) delete insurance.policyNumber;
    await updateOrderProfile(orgId, { ...profile, insurance });
    return (await getPassport(orgId)).documents.coi ?? null;
  }

  const stored = await getStoredPassport(orgId);
  const existing = stored.documents[kind];
  if (!existing) return null;
  const document: PassportDocument = { ...existing };
  if (patch.expiresAt) document.expiresAt = patch.expiresAt;
  else delete document.expiresAt;
  if (patch.reference) document.reference = patch.reference;
  else delete document.reference;
  await updateStoredPassport(orgId, { documents: { ...stored.documents, [kind]: document } });
  return document;
}

/** Drop the pointer for a slot. The object stays in the bucket. */
export async function removePassportDocument(orgId: string, kind: PassportKind): Promise<void> {
  if (kind === 'coi') {
    const profile = await getOrderProfile(orgId);
    const insurance = { ...profile.insurance };
    delete insurance.coiDocument;
    await updateOrderProfile(orgId, { ...profile, insurance });
    return;
  }
  const stored = await getStoredPassport(orgId);
  const documents = { ...stored.documents };
  delete documents[kind];
  await updateStoredPassport(orgId, { documents });
}

/** A short-lived signed download URL for a slot, or null when it is empty. */
export async function passportDownloadUrl(
  orgId: string,
  kind: PassportKind,
): Promise<{ url: string; name: string } | null> {
  if (kind === 'coi') return coiDownloadUrl(orgId);

  const doc = (await getStoredPassport(orgId)).documents[kind];
  if (!doc) return null;
  const { data, error } = await createAdminClient()
    .storage.from(paperworkBucket())
    .createSignedUrl(doc.storagePath, PAPERWORK_SIGNED_URL_SECONDS, { download: doc.name });
  if (error || !data?.signedUrl) throw new Error(`passportDownloadUrl: ${error?.message ?? 'no url'}`);
  return { url: data.signedUrl, name: doc.name };
}
