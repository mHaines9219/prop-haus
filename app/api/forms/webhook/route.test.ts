import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { orderDocumentRow } from '@/test/fixtures/order-documents';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

const SECRET = 'anvil-webhook-token';
const hook = (body: unknown) => POST(jsonRequest('/api/forms/webhook', body));
const complete = (eid = 'pkt-1', token = SECRET) => hook({ action: 'etchPacketComplete', token, data: { eid } });
const doc = () => db.rows('order_documents')[0];
const SIGNED = `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.doc-1.signed.pdf`;

beforeEach(() => {
  delete process.env.FORMS_PROVIDER;
  process.env.ANVIL_WEBHOOK_SECRET = SECRET;
  db.reset();
  db.seed('order_documents', [
    orderDocumentRow({ status: 'awaiting_signature', anvil_packet_eid: 'pkt-1', anvil_document_group_eid: 'grp-1', sign_url: 'https://anvil/sign' }),
  ]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.ANVIL_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe('POST /api/forms/webhook', () => {
  it('503 when no webhook secret is configured', async () => {
    delete process.env.ANVIL_WEBHOOK_SECRET;
    const res = await complete();
    expect(res.status).toBe(503);
    expect(db.log).toEqual([]);
  });

  it('400 for a body that is not JSON', async () => {
    const res = await POST(rawRequest('/api/forms/webhook', '{nope'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid JSON' });
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'anvil-webhook-tokeX'],
    ['shorter', 'anvil'],
    ['longer', `${SECRET}-and-more`],
    ['not a string', 12345],
  ])('401 for a %s token, before reading anything', async (_label, token) => {
    const res = await hook({ action: 'etchPacketComplete', token, data: { eid: 'pkt-1' } });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'bad token' });
    expect(db.log).toEqual([]);
    expect(doc().status).toBe('awaiting_signature');
  });

  it('acknowledges and ignores other actions', async () => {
    const res = await hook({ action: 'signerComplete', token: SECRET, data: { eid: 'pkt-1' } });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, ignored: 'signerComplete' });
    expect(doc().status).toBe('awaiting_signature');
  });

  it('400 for a completion with no packet eid', async () => {
    const res = await hook({ action: 'etchPacketComplete', token: SECRET, data: {} });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'no packet eid' });
  });

  it('acknowledges an unknown packet without changing anything', async () => {
    const res = await complete('pkt-unknown');
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, ignored: 'unknown packet' });
    expect(doc().status).toBe('awaiting_signature');
  });

  it('marks the document signed and stores the signed copy', async () => {
    const res = await complete();
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
    expect(doc()).toMatchObject({ status: 'signed', signed_storage_path: SIGNED, sign_url: null });
    expect(db.bucket('paperwork').has(SIGNED)).toBe(true);
    expect(db.rows('events')).toEqual([expect.objectContaining({ type: 'document_signed', user_id: null })]);
  });

  it('is idempotent on a redelivery', async () => {
    await complete();
    const res = await complete();
    expect(res.status).toBe(200);
    expect(db.rows('events')).toHaveLength(1);
  });

  it('500 so Anvil retries when the signed copy cannot be stored', async () => {
    db.failNextStorage('upload', 'bucket full');
    const res = await complete();
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'signed copy not stored' });
    expect(doc().status).toBe('awaiting_signature');
  });
});
