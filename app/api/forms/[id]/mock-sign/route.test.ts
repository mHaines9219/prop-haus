import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { params, rawRequest, readJson } from '@/test/helpers/request';
import { orderDocumentRow } from '@/test/fixtures/order-documents';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

const sign = (id: string) => POST(rawRequest(`/api/forms/${id}/mock-sign`, ''), params({ id }));
const doc = (id: string) => db.rows('order_documents').find((r) => r.id === id)!;
const SIGNED = `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.doc-1.signed.pdf`;

beforeEach(() => {
  delete process.env.FORMS_PROVIDER;
  db.reset();
  signIn();
  db.seed('order_documents', [
    orderDocumentRow({ status: 'awaiting_signature', anvil_packet_eid: 'mock-packet-1', anvil_document_group_eid: 'mock-group-1', sign_url: '/x?mock=1' }),
    orderDocumentRow({ id: 'filled', vendor_form_id: 'form-2' }),
  ]);
});

afterEach(() => {
  delete process.env.FORMS_PROVIDER;
});

describe('POST /api/forms/[id]/mock-sign', () => {
  it('404 when the real provider is configured, before the session or the db', async () => {
    process.env.FORMS_PROVIDER = 'anvil';
    const res = await sign('doc-1');
    expect(res.status).toBe(404);
    expect(db.log).toEqual([]);
    expect(doc('doc-1').status).toBe('awaiting_signature');
  });

  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await sign('doc-1');
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('records the user’s signature, storing the signed copy', async () => {
    const res = await sign('doc-1');
    expect(res.status).toBe(200);
    const { document } = await readJson<{ document: Record<string, unknown> }>(res);
    expect(document).toMatchObject({ id: 'doc-1', status: 'signed', signedStoragePath: SIGNED, signUrl: null });
    expect(doc('doc-1')).toMatchObject({ status: 'signed', signed_storage_path: SIGNED });
    expect(db.bucket('paperwork').has(SIGNED)).toBe(true);
    expect(db.rows('events')).toEqual([expect.objectContaining({ type: 'document_signed', user_id: USER_ID, org_id: ORG_ID })]);
  });

  it('answers a repeat with the signed document and no second event', async () => {
    await sign('doc-1');
    const res = await sign('doc-1');
    expect(res.status).toBe(200);
    expect((await readJson<{ document: { status: string } }>(res)).document.status).toBe('signed');
    expect(db.rows('events')).toHaveLength(1);
  });

  it('409 for a document that is not waiting for a signature', async () => {
    const res = await sign('filled');
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'This document is not waiting for a signature.' });
    expect(doc('filled').status).toBe('filled');
  });

  it('404 for another org’s document, the same as an unknown one, leaving it unsigned', async () => {
    signIn({ orgId: OTHER_ORG_ID });
    const theirs = await sign('doc-1');
    const unknown = await sign('nope');
    expect([theirs.status, unknown.status]).toEqual([404, 404]);
    expect(await readJson(theirs)).toEqual(await readJson(unknown));
    expect(doc('doc-1').status).toBe('awaiting_signature');
    expect(db.rows('events')).toEqual([]);
  });
});
