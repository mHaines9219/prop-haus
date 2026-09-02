/**
 * Sending the drafts after the click, and reading them back. Server only.
 *
 * Recomposes from the ORDER snapshot (never the live cart), applies the user's
 * edits by vendor, attaches the COI on file and whatever forms MVP-12 stored in
 * order_documents, records a row per vendor, and calls the mailer. Nothing here
 * throws to the caller: checkout's after() hook must never fail an order.
 */

import { createAdminClient } from '../supabase/admin';
import { paperworkBucket } from '../paperwork';
import { getOrderProfile } from '../order-profile-store';
import { recordEvents } from '../analytics';
import { mailer, type MailAttachment } from '../mail/provider';
import { VENDORS } from '../vendors';
import type { Order } from '../orders';
import { composeOutreach, textToHtml, type Draft, type DraftAttachment, type VendorDocument } from './compose';

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type OutboundMessage = {
  id: string;
  orderId: string;
  vendorId: string;
  vendorName: string;
  to: string;
  cc: string[];
  replyTo: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachments: DraftAttachment[];
  status: MessageStatus;
  sentAt?: string;
  providerMessageId?: string;
  error?: string;
  edited: boolean;
  createdAt: string;
};

/** A draft the user changed on the cart. Replaces subject and body for that vendor. */
export type MessageOverride = { vendorId: string; subject?: string; bodyText?: string };

const SUBJECT_MAX = 200;
const BODY_MAX = 20_000;

/** Coerce the checkout body's `messages` into overrides worth applying. */
export function normalizeOverrides(raw: unknown): MessageOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageOverride[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const { vendorId, subject, bodyText } = m as Record<string, unknown>;
    if (typeof vendorId !== 'string' || !vendorId) continue;
    const o: MessageOverride = { vendorId };
    if (typeof subject === 'string' && subject.trim()) o.subject = subject.trim().slice(0, SUBJECT_MAX);
    if (typeof bodyText === 'string' && bodyText.trim()) o.bodyText = bodyText.trim().slice(0, BODY_MAX);
    if (o.subject || o.bodyText) out.push(o);
  }
  return out;
}

export async function sendOrderOutreach(
  order: Order,
  opts: { overrides?: MessageOverride[] } = {},
): Promise<void> {
  if (process.env.OUTREACH === 'off') return;
  try {
    const profile = await getOrderProfile(order.orgId);
    const drafts = composeOutreach({
      lines: order.items.map((i) => ({
        itemId: i.itemId,
        source: i.source,
        sourceId: i.sourceId,
        name: i.name,
        image: i.image,
        sourceUrl: i.sourceUrl,
        vendor: i.vendor,
        priceCents: i.priceCents,
      })),
      rentalStart: order.rentalStart,
      rentalEnd: order.rentalEnd,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      profile,
      vendors: VENDORS,
      documents: await vendorDocuments(order.id),
      fallbackTo: process.env.OUTREACH_FALLBACK_TO,
    });

    const overrides = new Map((opts.overrides ?? []).map((o) => [o.vendorId, o]));
    for (const draft of drafts) {
      const override = overrides.get(draft.vendorId);
      const row = await insertMessage(order, applyOverride(draft, override), Boolean(override));
      await deliver(row, order.orgId);
    }
  } catch (err) {
    console.warn(`[outreach] order ${order.id} not sent: ${(err as Error).message}`);
  }
}

/** The messages an order sent, oldest first. Org-scoped. */
export async function listOrderMessages(orderId: string, orgId: string): Promise<OutboundMessage[]> {
  const { data, error } = await createAdminClient()
    .from('outbound_messages')
    .select('*')
    .eq('order_id', orderId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

/** Sent-message counts per order for an org, for the jobs board. */
export async function sentCountsByOrder(orgId: string): Promise<Map<string, number>> {
  const { data } = await createAdminClient()
    .from('outbound_messages')
    .select('order_id')
    .eq('org_id', orgId)
    .eq('status', 'sent');
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { order_id: string }[]) {
    counts.set(r.order_id, (counts.get(r.order_id) ?? 0) + 1);
  }
  return counts;
}

export type RetryResult =
  | { ok: true; message: OutboundMessage }
  | { ok: false; reason: 'not_found' | 'not_failed' };

/** Re-send a failed message exactly as stored. Org-scoped. */
export async function retryOutboundMessage(id: string, orgId: string): Promise<RetryResult> {
  const db = createAdminClient();
  const { data } = await db.from('outbound_messages').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!data) return { ok: false, reason: 'not_found' };
  const message = toMessage(data as MessageRow);
  if (message.status !== 'failed') return { ok: false, reason: 'not_failed' };

  await db
    .from('outbound_messages')
    .update({ status: 'sending', error: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  const sent = await deliver({ ...message, status: 'sending', error: undefined }, orgId);
  return { ok: true, message: sent };
}

// ---- internal ----

function applyOverride(draft: Draft, override: MessageOverride | undefined): Draft {
  if (!override) return draft;
  const bodyText = override.bodyText ?? draft.bodyText;
  return {
    ...draft,
    subject: override.subject ?? draft.subject,
    bodyText,
    bodyHtml: override.bodyText ? textToHtml(bodyText) : draft.bodyHtml,
  };
}

async function insertMessage(order: Order, draft: Draft, edited: boolean): Promise<OutboundMessage> {
  const { data, error } = await createAdminClient()
    .from('outbound_messages')
    .insert({
      org_id: order.orgId,
      order_id: order.id,
      vendor_id: draft.vendorId,
      vendor_name: draft.vendorName,
      to_email: draft.to,
      cc_emails: draft.cc,
      reply_to: draft.replyTo,
      subject: draft.subject,
      body_text: draft.bodyText,
      body_html: draft.bodyHtml,
      attachments: draft.attachments,
      status: 'sending',
      edited,
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('outbound_messages insert returned nothing');
  return toMessage(data as MessageRow);
}

/** Call the mailer and record the outcome. Never throws. */
async function deliver(message: OutboundMessage, orgId: string): Promise<OutboundMessage> {
  const db = createAdminClient();
  let patch: Record<string, unknown>;
  let final: OutboundMessage;

  try {
    if (!message.to) throw new Error('no vendor address and OUTREACH_FALLBACK_TO is unset');
    const { providerMessageId } = await mailer(downloadAttachment).send({
      to: message.to,
      cc: message.cc,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      attachments: message.attachments.map(toMailAttachment),
    });
    const sentAt = new Date().toISOString();
    patch = { status: 'sent', sent_at: sentAt, provider_message_id: providerMessageId, error: null };
    final = { ...message, status: 'sent', sentAt, providerMessageId, error: undefined };
  } catch (err) {
    const error = (err as Error).message ?? String(err);
    patch = { status: 'failed', error };
    final = { ...message, status: 'failed', error };
  }

  await db
    .from('outbound_messages')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', message.id);

  await recordEvents({
    orgId,
    type: final.status === 'sent' ? 'outreach_sent' : 'outreach_failed',
    payload: {
      orderId: message.orderId,
      messageId: message.id,
      vendorId: message.vendorId,
      ...(final.error ? { error: final.error } : {}),
    },
  });
  return final;
}

function toMailAttachment(a: DraftAttachment): MailAttachment {
  return { filename: a.name, content: { storagePath: a.storagePath }, contentType: a.contentType };
}

async function downloadAttachment(storagePath: string): Promise<Buffer> {
  const { data, error } = await createAdminClient().storage.from(paperworkBucket()).download(storagePath);
  if (error || !data) throw new Error(`attachment ${storagePath}: ${error?.message ?? 'not found'}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Forms MVP-12 filled for this order (its `order_documents` table). A signed
 * copy wins over the filled one; failed or skipped forms are not attached. If
 * the table is not there yet the email simply carries no forms.
 */
async function vendorDocuments(orderId: string): Promise<VendorDocument[]> {
  type Row = {
    vendor_id: string;
    label: string;
    status: string;
    storage_path: string | null;
    signed_storage_path: string | null;
  };
  try {
    const { data, error } = await createAdminClient()
      .from('order_documents')
      .select('vendor_id, label, status, storage_path, signed_storage_path')
      .eq('order_id', orderId);
    if (error || !data) return [];
    return (data as Row[])
      .filter((d) => d.status !== 'failed' && d.status !== 'skipped')
      .map((d) => ({ ...d, path: d.signed_storage_path ?? d.storage_path }))
      .filter((d) => d.path)
      .map((d) => ({
        vendorId: d.vendor_id,
        name: /\.pdf$/i.test(d.label) ? d.label : `${d.label}.pdf`,
        storagePath: d.path!,
        contentType: 'application/pdf',
      }));
  } catch {
    return [];
  }
}

type MessageRow = {
  id: string;
  order_id: string;
  vendor_id: string;
  vendor_name: string;
  to_email: string;
  cc_emails: string[] | null;
  reply_to: string;
  subject: string;
  body_text: string;
  body_html: string;
  attachments: DraftAttachment[] | null;
  status: string;
  sent_at: string | null;
  provider_message_id: string | null;
  error: string | null;
  edited: boolean;
  created_at: string;
};

function toMessage(r: MessageRow): OutboundMessage {
  return {
    id: r.id,
    orderId: r.order_id,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    to: r.to_email,
    cc: r.cc_emails ?? [],
    replyTo: r.reply_to,
    subject: r.subject,
    bodyText: r.body_text,
    bodyHtml: r.body_html,
    attachments: r.attachments ?? [],
    status: (r.status as MessageStatus) ?? 'sending',
    ...(r.sent_at ? { sentAt: r.sent_at } : {}),
    ...(r.provider_message_id ? { providerMessageId: r.provider_message_id } : {}),
    ...(r.error ? { error: r.error } : {}),
    edited: r.edited,
    createdAt: r.created_at,
  };
}
