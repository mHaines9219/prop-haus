/**
 * The email a coordinator would write after placing an order, written before
 * the click instead. Pure: takes cart-shaped input so the SAME function
 * produces the cart preview and the post-click send from the order snapshot.
 *
 * Copy voice is DESIGN.md §11: sentence case, terse, no exclamation points.
 */

import type { CartLineInput } from '../orders';
import { formatAddress, type Address, type OrderProfile } from '../order-profile';
import { checkCompatibility, type VendorInsuranceMinimum } from '../insurance/minimums';
import { PASSPORT_KIND_SPECS, type Passport, type PassportKind } from '../passport';
import { vendorAsksFor, type Vendor } from '../vendors';

export type DraftAttachment = { name: string; storagePath: string; contentType: string };

export type DraftItem = { name: string; sourceUrl: string; image?: string };

export type Draft = {
  vendorId: string;
  vendorName: string;
  /** Resolved recipient: the vendor's address, else the ops fallback, else empty. */
  to: string;
  /** True when `to` is the fallback mailbox (or empty) because the vendor has no address. */
  needsVendorAddress: boolean;
  cc: string[];
  replyTo: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachments: DraftAttachment[];
  items: DraftItem[];
  /** Preview-only notes (insurance gaps). Never part of the email. */
  warnings: string[];
};

/** A form MVP-12 filled for a vendor, attached and named in the paperwork line. */
export type VendorDocument = DraftAttachment & { vendorId: string };

export type ComposeInput = {
  lines: CartLineInput[];
  rentalStart?: string;
  rentalEnd?: string;
  deliveryAddress?: Address;
  deliveryNotes?: string;
  /** From the cart's request form; one section in every vendor's email when present. */
  shootDetails?: string;
  profile: OrderProfile;
  vendors: Record<string, Vendor>;
  minimums?: Record<string, VendorInsuranceMinimum>;
  documents?: VendorDocument[];
  /**
   * The passport as resolved by getPassport (the COI read through). Each
   * vendor's email attaches the passport documents that vendor asks for and
   * promises the ones not on file. The COI itself still reads from the profile.
   */
  passport?: Passport;
  fallbackTo?: string;
};

/**
 * Pickup is assumed (Oct 18 2026): most LA houses are will-call only, so the
 * cart offers no delivery option. A delivery address still prints when an
 * order carries one.
 */
export const PICKUP_LINE = 'Will call. We send our own truck for pickup and return.';

export function composeOutreach(input: ComposeInput): Draft[] {
  const byVendor = new Map<string, CartLineInput[]>();
  for (const line of input.lines) {
    byVendor.set(line.source, [...(byVendor.get(line.source) ?? []), line]);
  }
  return [...byVendor.entries()]
    .map(([vendorId, lines]) => composeOne(vendorId, lines, input))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

/** The HTML body for a user-edited plain-text draft: one <p> per paragraph. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${linkify(escapeHtml(p)).replace(/\n/g, '<br>')}</p>`);
  return wrapHtml(paragraphs.join('\n'));
}

/** "Sep 7 – Sep 14, 2026" from ISO dates; tolerates one or both missing. */
export function formatRentalWindow(start?: string, end?: string): string {
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end, true)}`;
  if (start) return `From ${fmtDate(start, true)}`;
  if (end) return `Until ${fmtDate(end, true)}`;
  return 'Dates to be confirmed';
}

// ---- internal ----

function composeOne(vendorId: string, lines: CartLineInput[], input: ComposeInput): Draft {
  const { profile } = input;
  const vendor = input.vendors[vendorId];
  const vendorName = vendor?.name ?? lines[0]!.vendor;
  const company = profile.company.legalName ?? 'Our production';
  const productionName = profile.company.dba ?? company;
  const who = profile.company.dba ? `${company} (DBA ${profile.company.dba})` : company;
  const contact = profile.contacts.ordering ?? {};
  const ap = profile.contacts.accountsPayable;

  const needsVendorAddress = !vendor?.orderEmail;
  const to = vendor?.orderEmail ?? input.fallbackTo ?? '';
  const window = formatRentalWindow(input.rentalStart, input.rentalEnd);
  const baseSubject = `Hold request · ${productionName} · ${window}`;
  const subject = needsVendorAddress ? `[needs vendor address] ${baseSubject}` : baseSubject;

  const items: DraftItem[] = lines.map((l) => ({
    name: l.name,
    sourceUrl: l.sourceUrl,
    ...(l.image ? { image: l.image } : {}),
  }));

  const coi = profile.insurance.coiDocument;
  const attachments: DraftAttachment[] = [];
  if (coi) attachments.push({ name: coi.name, storagePath: coi.storagePath, contentType: contentTypeFor(coi.name) });
  // What this house asks a new customer for, beyond the COI: attach what the
  // passport has, name what it does not. Only the vendors that ask get it.
  const asked = vendorAsksFor(vendor ?? {}).filter((k) => k !== 'coi');
  const onFile = asked.filter((k) => input.passport?.documents[k]);
  const toFollow = asked.filter((k) => !input.passport?.documents[k]);
  for (const kind of onFile) {
    const doc = input.passport!.documents[kind]!;
    attachments.push({ name: doc.name, storagePath: doc.storagePath, contentType: doc.mime });
  }
  const forms = (input.documents ?? []).filter((d) => d.vendorId === vendorId);
  for (const f of forms) attachments.push({ name: f.name, storagePath: f.storagePath, contentType: f.contentType });

  const paperwork: string[] = [];
  if (coi) paperwork.push('COI on file attached.');
  else if (profile.insurance.broker?.name) {
    const broker = profile.insurance.broker;
    paperwork.push(`COI to follow from our broker, ${broker.name}${broker.email ? ` (${broker.email})` : ''}.`);
  } else paperwork.push('COI to follow.');
  if (onFile.length) paperwork.push(`${joinNames(onFile.map(kindLabel))} attached.`);
  if (toFollow.length) paperwork.push(`${joinNames(toFollow.map(kindLabel))} to follow.`);
  if (forms.length) paperwork.push(`Completed ${joinNames(forms.map((f) => f.name))} attached.`);

  const address = formatAddress(input.deliveryAddress);
  const where = [address, input.deliveryNotes].filter((s): s is string => Boolean(s));
  const shoot = input.shootDetails?.trim();

  const signature = [
    contact.name,
    contact.phone,
    contact.email,
    `Sent via Prop Haus on behalf of ${company}`,
  ].filter(Boolean) as string[];

  const intro = `${who} would like to hold the following items.${contact.name ? ` ${contact.name} is the ordering contact.` : ''}`;
  const ask = 'Please confirm availability and send a quote. Reply to this email.';

  const bodyText = [
    `Hello ${vendorName},`,
    intro,
    ['Items', ...items.map((it, i) => `${i + 1}. ${it.name}\n   ${it.sourceUrl}`)].join('\n'),
    `Rental window\n${window}`,
    where.length ? `Deliver to\n${where.join('\n')}` : `Pickup\n${PICKUP_LINE}`,
    ...(shoot ? [`Shoot details\n${shoot}`] : []),
    `Paperwork\n${paperwork.join('\n')}`,
    ask,
    signature.join('\n'),
  ].join('\n\n');

  const bodyHtml = wrapHtml(
    [
      `<p>Hello ${escapeHtml(vendorName)},</p>`,
      `<p>${escapeHtml(intro)}</p>`,
      section('Items', items.map(itemHtml).join('\n')),
      section('Rental window', `<p>${escapeHtml(window)}</p>`),
      where.length
        ? section('Deliver to', `<p>${where.map(escapeHtml).join('<br>')}</p>`)
        : section('Pickup', `<p>${escapeHtml(PICKUP_LINE)}</p>`),
      ...(shoot ? [section('Shoot details', `<p>${escapeHtml(shoot).replace(/\n/g, '<br>')}</p>`)] : []),
      section('Paperwork', `<p>${paperwork.map(escapeHtml).join('<br>')}</p>`),
      `<p>${escapeHtml(ask)}</p>`,
      `<p>${signature.map(escapeHtml).join('<br>')}</p>`,
    ].join('\n'),
  );

  const warnings: string[] = [];
  const minimum = input.minimums?.[vendorId];
  if (minimum) {
    const result = checkCompatibility(profile.insurance, minimum);
    if (!result.compatible) warnings.push(...result.gaps);
  }
  if (needsVendorAddress) {
    warnings.push(to ? `No address on file for ${vendorName}. This goes to ${to}.` : `No address on file for ${vendorName}.`);
  }

  return {
    vendorId,
    vendorName,
    to,
    needsVendorAddress,
    cc: ap?.email ? [ap.email] : [],
    replyTo: contact.email ?? '',
    subject,
    bodyText,
    bodyHtml,
    attachments,
    items,
    warnings,
  };
}

function itemHtml(it: DraftItem): string {
  const img = it.image
    ? `<img src="${escapeAttr(it.image)}" alt="" width="72" height="72" style="width:72px;height:72px;object-fit:cover;border-radius:4px;margin-right:12px;vertical-align:middle">`
    : '';
  return `<p>${img}<a href="${escapeAttr(it.sourceUrl)}">${escapeHtml(it.name)}</a></p>`;
}

function section(label: string, body: string): string {
  return `<p style="margin-bottom:4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b70">${escapeHtml(label)}</p>\n${body}`;
}

function wrapHtml(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">\n${inner}\n</div>`;
}

/** "Credit card authorization" opening a sentence, "credit card authorization" inside one; "W-9" stays as is. */
function kindLabel(kind: PassportKind, index: number): string {
  const label = PASSPORT_KIND_SPECS[kind].label;
  if (index === 0 || !/^[A-Z][a-z]/.test(label)) return label;
  return label[0].toLowerCase() + label.slice(1);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
}
