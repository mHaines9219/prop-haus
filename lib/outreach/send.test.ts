import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { makeOrder, makeOrderItem, READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { LogMailer, type MailMessage } from '@/lib/mail/provider';
import {
  listOrderMessages,
  normalizeOverrides,
  retryOutboundMessage,
  sendOrderOutreach,
  sentCountsByOrder,
} from './send';

const omega = makeOrderItem();
const heritage = makeOrderItem({
  id: 'oi-2',
  itemId: 'heritage-9',
  source: 'heritage',
  sourceId: '9',
  name: 'Brass floor lamp',
  sourceUrl: 'https://heritagepropsla.com/item/9',
  vendor: 'Heritage Props',
});
/** A house with no order address on file. */
const noAddress = makeOrderItem({
  id: 'oi-3',
  itemId: 'artdimensions-4',
  source: 'artdimensions',
  sourceId: '4',
  name: 'Gilt mirror',
  sourceUrl: 'https://artdimensions.example/4',
  vendor: 'Art Dimensions',
});

let send: MockInstance<LogMailer['send']>;
const sentTo = () => send.mock.calls.map(([m]) => (m as MailMessage).to);

beforeEach(() => {
  db.reset();
  db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
  vi.stubEnv('MAIL_PROVIDER', '');
  vi.stubEnv('OUTREACH', '');
  vi.stubEnv('OUTREACH_FALLBACK_TO', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  send = vi.spyOn(LogMailer.prototype, 'send');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeOverrides', () => {
  it('keeps only overrides that name a vendor and change something, trimmed and capped', () => {
    const long = 'x'.repeat(300);
    expect(
      normalizeOverrides([
        null,
        'nope',
        { subject: 'no vendor' },
        { vendorId: '', subject: 'empty vendor' },
        { vendorId: 'omega', subject: '   ', bodyText: '' },
        { vendorId: 'omega', subject: `  ${long}  `, bodyText: '  Hi there  ' },
        { vendorId: 'heritage', bodyText: 'Body only' },
      ]),
    ).toEqual([
      { vendorId: 'omega', subject: 'x'.repeat(200), bodyText: 'Hi there' },
      { vendorId: 'heritage', bodyText: 'Body only' },
    ]);
  });

  it('returns nothing for a body that is not a list', () => {
    expect(normalizeOverrides(undefined)).toEqual([]);
    expect(normalizeOverrides({ vendorId: 'omega', subject: 'x' })).toEqual([]);
  });
});

describe('sendOrderOutreach', () => {
  it('writes and sends one message per vendor to the vendor order address, replying to the production contact', async () => {
    await sendOrderOutreach(makeOrder({ items: [omega, heritage] }));

    expect(sentTo().sort()).toEqual(['orders@heritagepropsla.com', 'orders@omegacinemaprops.com']);
    for (const [m] of send.mock.calls) expect((m as MailMessage).replyTo).toBe('sam@nocturne.example');

    const rows = db.rows('outbound_messages');
    expect(rows.map((r) => [r.vendor_id, r.status, r.edited, r.org_id, r.order_id]).sort()).toEqual([
      ['heritage', 'sent', false, ORG_ID, 'order-1'],
      ['omega', 'sent', false, ORG_ID, 'order-1'],
    ]);
    for (const r of rows) {
      expect(r.provider_message_id).toMatch(/^log-/);
      expect(r.sent_at).toEqual(expect.any(String));
    }
    expect(db.rows('events').map((e) => e.type)).toEqual(['outreach_sent', 'outreach_sent']);
  });

  it('applies the user edits to that vendor only and marks the message edited', async () => {
    await sendOrderOutreach(makeOrder({ items: [omega, heritage] }), {
      overrides: [{ vendorId: 'omega', subject: 'Edited subject', bodyText: 'Line one\n\nLine <two>' }],
    });

    const mails = send.mock.calls.map(([m]) => m as MailMessage);
    const omegaMail = mails.find((m) => m.to === 'orders@omegacinemaprops.com')!;
    const heritageMail = mails.find((m) => m.to === 'orders@heritagepropsla.com')!;
    expect(omegaMail.subject).toBe('Edited subject');
    expect(omegaMail.text).toBe('Line one\n\nLine <two>');
    expect(omegaMail.html).toContain('Line &lt;two&gt;');
    expect(heritageMail.subject).toMatch(/^Hold request/);

    expect(Object.fromEntries(db.rows('outbound_messages').map((r) => [r.vendor_id, r.edited]))).toEqual({
      omega: true,
      heritage: false,
    });
  });

  it('keeps the drafted html when only the subject was edited', async () => {
    await sendOrderOutreach(makeOrder(), { overrides: [{ vendorId: 'omega', subject: 'Just the subject' }] });
    const [stored] = db.rows('outbound_messages');
    const [mail] = send.mock.calls[0] as [MailMessage];
    expect(mail.subject).toBe('Just the subject');
    expect(mail.html).toBe(stored.body_html);
    expect(mail.html).toContain('Mid-century walnut credenza');
  });

  it('records a vendor that fails and still sends the rest of the batch', async () => {
    await sendOrderOutreach(makeOrder({ items: [noAddress, omega] }));

    expect(sentTo()).toEqual(['orders@omegacinemaprops.com']);
    const rows = db.rows('outbound_messages');
    expect(rows.map((r) => [r.vendor_id, r.status])).toEqual([
      ['artdimensions', 'failed'],
      ['omega', 'sent'],
    ]);
    expect(rows[0].error).toBe('no vendor address and OUTREACH_FALLBACK_TO is unset');
    expect(db.rows('events').map((e) => [e.type, (e.payload as { error?: string }).error])).toEqual([
      ['outreach_failed', 'no vendor address and OUTREACH_FALLBACK_TO is unset'],
      ['outreach_sent', undefined],
    ]);
  });

  it('records a provider error on that message without failing the order', async () => {
    send.mockRejectedValueOnce(new Error('provider down'));
    await expect(sendOrderOutreach(makeOrder({ items: [omega, heritage] }))).resolves.toBeUndefined();
    expect(db.rows('outbound_messages').map((r) => [r.status, r.error ?? null])).toEqual([
      ['failed', 'provider down'],
      ['sent', null],
    ]);
  });

  it('sends a house with no address to the fallback when one is configured', async () => {
    vi.stubEnv('OUTREACH_FALLBACK_TO', 'ops@prophaus.example');
    await sendOrderOutreach(makeOrder({ items: [noAddress] }));
    expect(sentTo()).toEqual(['ops@prophaus.example']);
    expect(db.rows('outbound_messages')[0].status).toBe('sent');
  });

  it('writes a sandbox order as inquiries and never reaches a mailer, even with a real provider configured', async () => {
    vi.stubEnv('MAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_never_used');
    vi.stubEnv('MAIL_FROM', 'Prop Haus <orders@prophaus.example>');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await sendOrderOutreach(makeOrder({ sandbox: true, items: [omega, heritage] }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(db.rows('outbound_messages').map((r) => r.status)).toEqual(['sandbox', 'sandbox']);
    expect(db.rows('events')).toEqual([]);
  });

  it('does nothing when outreach is switched off', async () => {
    vi.stubEnv('OUTREACH', 'off');
    await sendOrderOutreach(makeOrder());
    expect(send).not.toHaveBeenCalled();
    expect(db.log).toEqual([]);
  });

  it('swallows a failed write so checkout never fails, and sends nothing for that order', async () => {
    db.failNext('outbound_messages', 'insert', 'insert refused');
    await expect(sendOrderOutreach(makeOrder())).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('order order-1 not sent: insert refused'));
  });

  it('attaches the forms filled for the vendor, preferring the signed copy and skipping failed or empty ones', async () => {
    db.seed('order_documents', [
      { order_id: 'order-1', vendor_id: 'omega', label: 'Rental agreement', status: 'signed', storage_path: 'o/ra.pdf', signed_storage_path: 'o/ra-signed.pdf' },
      { order_id: 'order-1', vendor_id: 'omega', label: 'Credit app.PDF', status: 'filled', storage_path: 'o/credit.pdf', signed_storage_path: null },
      { order_id: 'order-1', vendor_id: 'omega', label: 'Broken', status: 'failed', storage_path: 'o/broken.pdf', signed_storage_path: null },
      { order_id: 'order-1', vendor_id: 'omega', label: 'Skipped', status: 'skipped', storage_path: 'o/skip.pdf', signed_storage_path: null },
      { order_id: 'order-1', vendor_id: 'omega', label: 'Pending', status: 'pending', storage_path: null, signed_storage_path: null },
      { order_id: 'order-2', vendor_id: 'omega', label: 'Other order', status: 'filled', storage_path: 'o/other.pdf', signed_storage_path: null },
    ]);

    await sendOrderOutreach(makeOrder());

    const [mail] = send.mock.calls[0] as [MailMessage];
    expect(mail.attachments?.map((a) => [a.filename, a.content, a.contentType])).toEqual([
      ['Rental agreement.pdf', { storagePath: 'o/ra-signed.pdf' }, 'application/pdf'],
      ['Credit app.PDF', { storagePath: 'o/credit.pdf' }, 'application/pdf'],
    ]);
  });

  it('still sends, without forms, when the documents table cannot be read', async () => {
    db.failNext('order_documents', 'select', 'relation "order_documents" does not exist');
    await sendOrderOutreach(makeOrder());
    const [mail] = send.mock.calls[0] as [MailMessage];
    expect(mail.attachments).toEqual([]);
    expect(db.rows('outbound_messages')[0].status).toBe('sent');
  });

  describe('through Resend', () => {
    beforeEach(() => {
      vi.stubEnv('MAIL_PROVIDER', 'resend');
      vi.stubEnv('RESEND_API_KEY', 're_test_key');
      vi.stubEnv('MAIL_FROM', 'Prop Haus <orders@prophaus.example>');
      db.seed('order_documents', [
        { order_id: 'order-1', vendor_id: 'omega', label: 'Rental agreement', status: 'filled', storage_path: 'o/ra.pdf', signed_storage_path: null },
      ]);
    });

    it('reads attachments from the paperwork bucket and posts them base64', async () => {
      db.bucket('paperwork').set('o/ra.pdf', { bytes: new TextEncoder().encode('%PDF-ra'), contentType: 'application/pdf' });
      const fetchMock = vi.fn(async () => Response.json({ id: 'resend-1' }));
      vi.stubGlobal('fetch', fetchMock);

      await sendOrderOutreach(makeOrder());

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.resend.com/emails');
      const body = JSON.parse(init.body as string);
      expect(body.to).toEqual(['orders@omegacinemaprops.com']);
      expect(body.attachments).toEqual([
        { filename: 'Rental agreement.pdf', content: Buffer.from('%PDF-ra').toString('base64'), content_type: 'application/pdf' },
      ]);
      expect(db.rows('outbound_messages')[0]).toMatchObject({ status: 'sent', provider_message_id: 'resend-1' });
    });

    it('fails that message, without calling Resend, when an attachment is missing from storage', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await sendOrderOutreach(makeOrder());

      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.rows('outbound_messages')[0]).toMatchObject({
        status: 'failed',
        error: 'attachment o/ra.pdf: Object not found',
      });
    });
  });
});

function messageRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    org_id: ORG_ID,
    order_id: 'order-1',
    vendor_id: 'omega',
    vendor_name: 'Omega Cinema Props',
    to_email: 'orders@omegacinemaprops.com',
    cc_emails: null,
    reply_to: 'sam@nocturne.example',
    subject: 'Hold request',
    body_text: 'Hello',
    body_html: '<p>Hello</p>',
    attachments: null,
    status: 'failed',
    sent_at: null,
    provider_message_id: null,
    error: 'provider down',
    edited: false,
    created_at: '2026-09-02T10:00:00.000Z',
    ...over,
  };
}

describe('listOrderMessages', () => {
  it("returns only this org's messages for the order, oldest first", async () => {
    db.seed('outbound_messages', [
      messageRow({ id: 'm-late', status: 'sent', error: null, sent_at: '2026-09-02T11:00:00Z', provider_message_id: 'p-1', created_at: '2026-09-02T11:00:00Z' }),
      messageRow({ id: 'm-early', created_at: '2026-09-02T09:00:00Z' }),
      messageRow({ id: 'm-other-org', org_id: OTHER_ORG_ID }),
      messageRow({ id: 'm-other-order', order_id: 'order-2' }),
    ]);

    const messages = await listOrderMessages('order-1', ORG_ID);

    expect(messages.map((m) => m.id)).toEqual(['m-early', 'm-late']);
    expect(messages[0]).toMatchObject({ status: 'failed', error: 'provider down', cc: [], attachments: [] });
    expect(messages[0]).not.toHaveProperty('sentAt');
    expect(messages[1]).toMatchObject({ status: 'sent', sentAt: '2026-09-02T11:00:00Z', providerMessageId: 'p-1' });
    expect(messages[1]).not.toHaveProperty('error');
  });

  it('throws when the read fails', async () => {
    db.failNext('outbound_messages', 'select', 'timeout');
    await expect(listOrderMessages('order-1', ORG_ID)).rejects.toMatchObject({ message: 'timeout' });
  });
});

describe('sentCountsByOrder', () => {
  it("counts only this org's sent messages, per order", async () => {
    db.seed('outbound_messages', [
      messageRow({ order_id: 'order-1', status: 'sent' }),
      messageRow({ order_id: 'order-1', status: 'sent' }),
      messageRow({ order_id: 'order-1', status: 'failed' }),
      messageRow({ order_id: 'order-2', status: 'sent' }),
      messageRow({ order_id: 'order-3', status: 'sent', org_id: OTHER_ORG_ID }),
    ]);
    expect(Object.fromEntries(await sentCountsByOrder(ORG_ID))).toEqual({ 'order-1': 2, 'order-2': 1 });
  });

  it('is empty when the read returns nothing', async () => {
    db.failNext('outbound_messages', 'select', 'timeout');
    expect((await sentCountsByOrder(ORG_ID)).size).toBe(0);
  });
});

describe('retryOutboundMessage', () => {
  it('re-sends exactly the stored message once and records it as sent', async () => {
    const [row] = db.seed('outbound_messages', [
      messageRow({ cc_emails: ['ap@nocturne.example'], subject: 'Stored subject', body_text: 'Stored body' }),
    ]);

    const result = await retryOutboundMessage(String(row.id), ORG_ID);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'orders@omegacinemaprops.com',
      cc: ['ap@nocturne.example'],
      replyTo: 'sam@nocturne.example',
      subject: 'Stored subject',
      text: 'Stored body',
    });
    expect(result).toMatchObject({ ok: true, message: { id: row.id, status: 'sent' } });
    expect(result.ok && result.message.error).toBeUndefined();
    expect(db.rows('outbound_messages')[0]).toMatchObject({ status: 'sent', error: null });
    expect(db.rows('events')).toEqual([
      expect.objectContaining({ type: 'outreach_sent', org_id: ORG_ID }),
    ]);
  });

  it("is not found for another org's message, and sends nothing", async () => {
    const [row] = db.seed('outbound_messages', [messageRow({ org_id: OTHER_ORG_ID })]);
    expect(await retryOutboundMessage(String(row.id), ORG_ID)).toEqual({ ok: false, reason: 'not_found' });
    expect(send).not.toHaveBeenCalled();
    expect(db.rows('outbound_messages')[0].status).toBe('failed');
  });

  it.each(['sent', 'sending', 'sandbox'])('refuses a %s message', async (status) => {
    const [row] = db.seed('outbound_messages', [messageRow({ status })]);
    expect(await retryOutboundMessage(String(row.id), ORG_ID)).toEqual({ ok: false, reason: 'not_failed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends once when two retries of the same message race', async () => {
    const [row] = db.seed('outbound_messages', [messageRow()]);
    const results = await Promise.all([
      retryOutboundMessage(String(row.id), ORG_ID),
      retryOutboundMessage(String(row.id), ORG_ID),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
  });

  it('records the new error when the retry fails again', async () => {
    send.mockRejectedValueOnce(new Error('still down'));
    const [row] = db.seed('outbound_messages', [messageRow()]);
    const result = await retryOutboundMessage(String(row.id), ORG_ID);
    expect(result).toMatchObject({ ok: true, message: { status: 'failed', error: 'still down' } });
    expect(db.rows('outbound_messages')[0]).toMatchObject({ status: 'failed', error: 'still down' });
  });
});
