/**
 * Field-map resolution: a vendor form's `{ alias: path }` map against the order
 * profile, the order, and the vendor, producing the `data` Anvil fills.
 *
 * Path forms:
 *   company.legalName             an order-profile path
 *   $order.rentalStart            the order (ref, rentalStart, rentalEnd,
 *                                 deliveryAddress, deliveryNotes, itemCount, itemList)
 *   $vendor.additionalInsuredWording  the vendor (id, name, website, and the wording)
 *   $form.label                   the form itself (kind, label)
 *   $signer.ein                   left blank; the signer completes it in Anvil.
 *                                 Never resolved here, never reported missing.
 * A `|date:FORMAT` suffix overrides the MM/DD/YYYY default for date values;
 * money resolves to plain digits. Pure: no I/O, so it is unit-tested on fixtures.
 */

import { formatAddress, type OrderProfile } from '@/lib/order-profile';
import type { Order } from '@/lib/orders';

export type FieldMap = Record<string, string>;

export type VendorContext = {
  id: string;
  name: string;
  website?: string;
  additionalInsuredWording?: string;
};

export type FormContext = { kind: string; label: string };

export type ResolveInput = {
  profile: OrderProfile;
  order: Order;
  vendor: VendorContext;
  form: FormContext;
};

export type ResolvedFields = {
  /** Aliases with a value, ready for the filler. */
  data: Record<string, string>;
  /** Human labels of aliases that resolved to nothing. */
  missing: string[];
  /** Aliases the signer fills inside the e-sign session. */
  signerFields: string[];
};

export function resolveFieldMap(fieldMap: FieldMap, ctx: ResolveInput): ResolvedFields {
  const data: Record<string, string> = {};
  const missing: string[] = [];
  const signerFields: string[] = [];

  for (const [alias, spec] of Object.entries(fieldMap)) {
    const [path, ...mods] = spec.split('|').map((s) => s.trim());
    if (path.startsWith('$signer.')) {
      signerFields.push(alias);
      continue;
    }
    const value = format(lookup(path, ctx), mods);
    if (value) data[alias] = value;
    else missing.push(humanize(alias));
  }

  return { data, missing, signerFields };
}

function lookup(path: string, ctx: ResolveInput): unknown {
  if (path.startsWith('$order.')) return orderValue(path.slice(7), ctx.order);
  if (path.startsWith('$vendor.')) return (ctx.vendor as Record<string, unknown>)[path.slice(8)];
  if (path.startsWith('$form.')) return (ctx.form as Record<string, unknown>)[path.slice(6)];
  return path.split('.').reduce<unknown>((o, key) => {
    return o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined;
  }, ctx.profile);
}

function orderValue(key: string, order: Order): unknown {
  switch (key) {
    case 'ref':
      return order.id.slice(0, 8).toUpperCase();
    case 'itemCount':
      return order.items.length;
    case 'itemList':
      return order.items.map((i) => i.name).join('; ');
    default:
      return (order as unknown as Record<string, unknown>)[key];
  }
}

function format(value: unknown, mods: string[]): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value)) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return formatAddress(value as Parameters<typeof formatAddress>[0]);

  const s = String(value).trim();
  const dateMod = mods.find((m) => m.startsWith('date:'));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return formatDate(iso[1], iso[2], iso[3], dateMod ? dateMod.slice(5) : 'MM/DD/YYYY');
  return s;
}

function formatDate(y: string, m: string, d: string, pattern: string): string {
  return pattern.replace('YYYY', y).replace('MM', m).replace('DD', d);
}

/** "contactPhone" → "Contact phone", "legal_name" → "Legal name". */
export function humanize(alias: string): string {
  const words = alias
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : alias;
}
