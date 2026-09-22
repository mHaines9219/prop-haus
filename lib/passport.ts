/**
 * The passport: documents a production is asked for on nearly every rental,
 * kept once on the org so checkout and vendor paperwork can attach them.
 *
 * Pure module (types, kinds, normalization, summary) so client components can
 * import it; reads, writes, and storage live in passport-store.ts.
 */

import type { OrderProfile } from './order-profile';

export const PASSPORT_KINDS = [
  'drivers_license',
  'w9',
  'coi',
  'business_license',
  'resale_certificate',
  'voided_check',
] as const;
export type PassportKind = (typeof PASSPORT_KINDS)[number];

/** Kinds stored in organizations.passport. The COI reads through to the order profile. */
export const STORED_PASSPORT_KINDS = PASSPORT_KINDS.filter((k) => k !== 'coi') as Exclude<PassportKind, 'coi'>[];

export type PassportKindSpec = {
  label: string;
  /** Where vendors ask for it, so the row explains itself. */
  usedFor: string;
  /** Show and track an expiry date. */
  expires: boolean;
  /** Label for the free-text reference field, or null when the kind has none. */
  referenceLabel: string | null;
  /** Certificates and IDs must be a PDF or an image; anything else may be an Office file too. */
  pdfOrImageOnly: boolean;
};

export const PASSPORT_KIND_SPECS: Record<PassportKind, PassportKindSpec> = {
  drivers_license: {
    label: "Driver's license",
    usedFor: 'Checked at pickup and copied onto most rental agreements.',
    expires: true,
    referenceLabel: 'License number',
    pdfOrImageOnly: true,
  },
  w9: {
    label: 'W-9',
    usedFor: 'Vendors request one before opening an account or paying a deposit back.',
    expires: false,
    referenceLabel: null,
    pdfOrImageOnly: false,
  },
  coi: {
    label: 'Certificate of insurance',
    usedFor: 'Attached to every vendor request. Issued by your broker; details live on the order profile.',
    expires: true,
    referenceLabel: 'Policy number',
    pdfOrImageOnly: true,
  },
  business_license: {
    label: 'Business license',
    usedFor: 'New-account and credit applications.',
    expires: true,
    referenceLabel: 'License number',
    pdfOrImageOnly: true,
  },
  resale_certificate: {
    label: 'Resale / tax-exempt certificate',
    usedFor: 'Lets a vendor drop sales tax on the rental.',
    expires: true,
    referenceLabel: 'Certificate number',
    pdfOrImageOnly: true,
  },
  voided_check: {
    label: 'Voided check or bank letter',
    usedFor: 'ACH setup on vendor credit applications.',
    expires: false,
    referenceLabel: null,
    pdfOrImageOnly: true,
  },
};

export type PassportDocument = {
  storagePath: string;
  name: string;
  mime: string;
  uploadedAt: string;
  uploadedByUserId?: string;
  expiresAt?: string;
  reference?: string;
};

export type PassportDocuments = Partial<Record<PassportKind, PassportDocument>>;

export type Passport = { documents: PassportDocuments };

export const EMPTY_PASSPORT: Passport = { documents: {} };

/** The metadata a user can edit on a slot without re-uploading. */
export type PassportDocumentPatch = Pick<PassportDocument, 'expiresAt' | 'reference'>;

export function isPassportKind(v: unknown): v is PassportKind {
  return typeof v === 'string' && (PASSPORT_KINDS as readonly string[]).includes(v);
}

/** Fold the order profile's COI into the passport so the wallet shows one certificate. */
export function resolvePassport(passport: Passport, profile: OrderProfile): Passport {
  const coi = profile.insurance.coiDocument;
  const documents: PassportDocuments = { ...passport.documents };
  delete documents.coi;
  if (coi) {
    documents.coi = {
      ...coi,
      mime: coi.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/*',
      expiresAt: profile.insurance.expiresAt,
      reference: profile.insurance.policyNumber,
    };
  }
  return { documents };
}

// ---- summary ----

export type PassportSummary = {
  onFile: number;
  total: number;
  /** Labels of documents on file whose expiry date has passed. */
  expired: string[];
  /** Labels of the slots still empty. */
  missing: string[];
};

export function passportSummary(passport: Passport, now = new Date()): PassportSummary {
  const expired: string[] = [];
  const missing: string[] = [];
  let onFile = 0;
  for (const kind of PASSPORT_KINDS) {
    const doc = passport.documents[kind];
    const label = PASSPORT_KIND_SPECS[kind].label;
    if (!doc) {
      missing.push(label);
      continue;
    }
    onFile += 1;
    if (isExpired(doc.expiresAt, now)) expired.push(label);
  }
  return { onFile, total: PASSPORT_KINDS.length, expired, missing };
}

export function isExpired(expiresAt: string | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

// ---- normalization (what the jsonb column is allowed to hold) ----

export function normalizePassport(raw: unknown): Passport {
  const o = obj(raw);
  const docs = obj(o.documents);
  const documents: PassportDocuments = {};
  for (const kind of STORED_PASSPORT_KINDS) {
    const doc = normalizeDocument(docs[kind]);
    if (doc) documents[kind] = doc;
  }
  return { documents };
}

export function normalizeDocument(raw: unknown): PassportDocument | undefined {
  const d = obj(raw);
  const storagePath = str(d.storagePath);
  const name = str(d.name);
  const mime = str(d.mime);
  const uploadedAt = str(d.uploadedAt);
  if (!storagePath || !name || !mime || !uploadedAt) return undefined;
  return strip({
    storagePath,
    name,
    mime,
    uploadedAt,
    uploadedByUserId: str(d.uploadedByUserId),
    expiresAt: str(d.expiresAt),
    reference: str(d.reference),
  });
}

export function normalizeDocumentPatch(raw: unknown): PassportDocumentPatch {
  const d = obj(raw);
  return { expiresAt: str(d.expiresAt), reference: str(d.reference) };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, 500) : undefined;
}

function strip<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
