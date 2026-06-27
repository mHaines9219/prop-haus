/**
 * Sensitive document metadata — W9s and COIs.
 *
 * Files themselves live in a PRIVATE Supabase Storage bucket (never public).
 * This table only tracks metadata; access to the bytes is via short-lived
 * signed URLs minted server-side. Storage RLS scopes access on the first path
 * segment, which MUST be the org id — see documentStoragePath().
 */
import type { Source } from './types';

export const DOCUMENTS_BUCKET = 'documents'; // private bucket (public: false)

export const DOCUMENT_KINDS = ['w9', 'coi', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ['uploaded', 'verified', 'rejected', 'expired'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type StoredDocument = {
  id: string;
  orgId: string;
  kind: DocumentKind;
  vendor?: Source; // set for COIs tied to a specific vendor relationship
  storagePath: string; // path within the private 'documents' bucket
  filename: string;
  mime?: string;
  sizeBytes?: number;
  uploadedBy?: string; // auth user id
  status: DocumentStatus; // 'verified' is set server-side only, never by the client
  expiresAt?: string; // e.g. COI expiration date
  createdAt: string;
  metadata: Record<string, unknown>;
};

/**
 * Build the storage path for a document. The FIRST segment must be the org id —
 * Storage RLS authorizes on `(storage.foldername(name))[1]`, so this is what
 * keeps one org's W9s/COIs unreachable by another org.
 */
export function documentStoragePath(orgId: string, documentId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return `${orgId}/${documentId}__${safe}`;
}
