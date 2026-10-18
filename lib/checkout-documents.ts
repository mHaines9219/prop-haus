/**
 * The documents a cart's vendors ask a new customer for, held against what the
 * passport already has. This is what the cart's Documents group shows, and
 * the same answer the outreach email acts on (attach what is on file, promise
 * the rest). Pure and client-importable: the cart computes it from the local
 * vendor list and the passport the readiness call returned.
 *
 * Which vendor asks for what is data on the vendor (lib/vendors.ts asksFor).
 * Nothing here blocks the click: a missing document is a "to follow" line in
 * the email, never a refusal.
 */

import { PASSPORT_KINDS, PASSPORT_KIND_SPECS, isExpired, type Passport, type PassportDocument, type PassportKind } from './passport';
import { VENDORS, vendorAsksFor, type Vendor } from './vendors';
import type { Source } from './types';

export type CartDocumentStatus = 'missing' | 'expired' | 'on_file';

export type CartDocument = {
  kind: PassportKind;
  label: string;
  usedFor: string;
  /** Display names of the cart's vendors that ask for it, in cart order. */
  askedBy: string[];
  /** True when every vendor in the cart asks for it. */
  askedByAll: boolean;
  status: CartDocumentStatus;
  document?: PassportDocument;
};

/**
 * One row per document any vendor in the cart asks for, in passport order.
 * Unknown vendor ids count as asking for what every house asks for.
 */
export function cartDocuments(
  vendorIds: string[],
  passport: Passport,
  now = new Date(),
  vendors: Record<string, Vendor> = VENDORS,
): CartDocument[] {
  const ids = [...new Set(vendorIds)];
  if (ids.length === 0) return [];

  const askedBy = new Map<PassportKind, string[]>();
  for (const id of ids) {
    const vendor = vendors[id as Source];
    const name = vendor?.name ?? id;
    for (const kind of vendorAsksFor(vendor ?? {})) {
      askedBy.set(kind, [...(askedBy.get(kind) ?? []), name]);
    }
  }

  return PASSPORT_KINDS.filter((kind) => askedBy.has(kind)).map((kind) => {
    const document = passport.documents[kind];
    const names = askedBy.get(kind)!;
    return {
      kind,
      label: PASSPORT_KIND_SPECS[kind].label,
      usedFor: PASSPORT_KIND_SPECS[kind].usedFor,
      askedBy: names,
      askedByAll: names.length === ids.length,
      status: !document ? 'missing' : isExpired(document.expiresAt, now) ? 'expired' : 'on_file',
      ...(document ? { document } : {}),
    };
  });
}

/** "Asked for by Omega Cinema Props and HPR", or "Every vendor in your cart asks for this." */
export function askedByLine(doc: CartDocument): string {
  if (doc.askedByAll) return 'Every vendor in your cart asks for this.';
  return `Asked for by ${joinNames(doc.askedBy)}.`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
