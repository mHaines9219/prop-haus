import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, USER_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { orderDocumentRow as docRow } from '@/test/fixtures/order-documents';
import {
  countPendingDocuments,
  documentDownloadUrl,
  documentStoragePath,
  findDocumentByPacket,
  getOrderDocument,
  listOrderDocuments,
  markDocumentSigned,
} from './documents';

const row = (id: string) => db.rows('order_documents').find((r) => r.id === id)!;
const bucket = () => db.bucket('paperwork');

beforeAll(() => {
  delete process.env.FORMS_PROVIDER;
  delete process.env.PAPERWORK_BUCKET;
});

beforeEach(() => {
  db.reset();
});

describe('documentStoragePath', () => {
  it('files a form under org, order and vendor, with an optional suffix', () => {
    expect(documentStoragePath('org', 'ord', 'omega', 'w9_request')).toBe('orgs/org/orders/ord/omega/w9_request.pdf');
    expect(documentStoragePath('org', 'ord', 'omega', 'w9_request', '.v2')).toBe('orgs/org/orders/ord/omega/w9_request.v2.pdf');
  });
});

describe('listOrderDocuments', () => {
  it('returns this org’s documents on the order, oldest first, in app shape', async () => {
    db.seed('order_documents', [
      docRow({ id: 'late', created_at: '2026-09-03T00:00:00Z' }),
      docRow({ id: 'early', created_at: '2026-09-01T00:00:00Z', kind: 'coi_request', label: 'COI request', status: 'manual' }),
      docRow({ id: 'other-order', order_id: 'order-2' }),
      docRow({ id: 'other-org', org_id: OTHER_ORG_ID }),
    ]);
    const docs = await listOrderDocuments('order-1', ORG_ID);
    expect(docs.map((d) => d.id)).toEqual(['early', 'late']);
    expect(docs[0]).toEqual({
      id: 'early',
      orgId: ORG_ID,
      orderId: 'order-1',
      vendorId: 'omega',
      vendorFormId: 'form-1',
      kind: 'coi_request',
      label: 'COI request',
      status: 'manual',
      storagePath: `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.pdf`,
      signedStoragePath: null,
      anvilPacketEid: null,
      anvilDocumentGroupEid: null,
      signUrl: null,
      error: null,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
    });
  });

  it('is empty for another org’s order', async () => {
    db.seed('order_documents', [docRow()]);
    expect(await listOrderDocuments('order-1', OTHER_ORG_ID)).toEqual([]);
  });

  it('throws on a database error', async () => {
    db.failNext('order_documents', 'select', 'boom');
    await expect(listOrderDocuments('order-1', ORG_ID)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('getOrderDocument', () => {
  it('finds the org’s document and hides another org’s', async () => {
    db.seed('order_documents', [docRow()]);
    expect((await getOrderDocument('doc-1', ORG_ID))?.id).toBe('doc-1');
    expect(await getOrderDocument('doc-1', OTHER_ORG_ID)).toBeNull();
    expect(await getOrderDocument('nope', ORG_ID)).toBeNull();
  });

  it('throws on a database error', async () => {
    db.failNext('order_documents', 'select', 'boom');
    await expect(getOrderDocument('doc-1', ORG_ID)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('countPendingDocuments', () => {
  beforeEach(() => {
    db.seed('order_documents', [
      docRow({ id: 'a', status: 'awaiting_signature' }),
      docRow({ id: 'b', status: 'manual', order_id: 'order-2' }),
      docRow({ id: 'c', status: 'filled' }),
      docRow({ id: 'd', status: 'signed' }),
      docRow({ id: 'e', status: 'failed' }),
      docRow({ id: 'f', status: 'awaiting_signature', org_id: OTHER_ORG_ID }),
    ]);
  });

  it('counts the org’s documents waiting to be signed or handled by hand', async () => {
    expect(await countPendingDocuments(ORG_ID)).toBe(2);
  });

  it('narrows to the given orders', async () => {
    expect(await countPendingDocuments(ORG_ID, { orderIds: ['order-2'] })).toBe(1);
  });

  it('is zero for an empty order list, without a query', async () => {
    expect(await countPendingDocuments(ORG_ID, { orderIds: [] })).toBe(0);
    expect(db.log).toEqual([]);
  });

  it('is zero when the count fails', async () => {
    db.failNext('order_documents', 'select', 'boom');
    expect(await countPendingDocuments(ORG_ID)).toBe(0);
  });
});

describe('documentDownloadUrl', () => {
  it('mints a 60-second link to the filled PDF named after the form', async () => {
    db.seed('order_documents', [docRow()]);
    bucket().set(row('doc-1').storage_path as string, { bytes: new Uint8Array([1]) });
    const out = await documentDownloadUrl('doc-1', ORG_ID);
    expect(out?.name).toBe('Rental agreement.pdf');
    expect(out?.url).toContain('https://fake.storage/paperwork/');
    expect(db.signedUrls).toEqual([
      { bucket: 'paperwork', path: row('doc-1').storage_path, expiresIn: 60, options: { download: 'Rental agreement.pdf' } },
    ]);
  });

  it('prefers the signed copy and keeps its extension', async () => {
    const signedPath = `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.signed.zip`;
    db.seed('order_documents', [docRow({ status: 'signed', signed_storage_path: signedPath })]);
    bucket().set(signedPath, { bytes: new Uint8Array([1]) });
    const out = await documentDownloadUrl('doc-1', ORG_ID);
    expect(out?.name).toBe('Rental agreement (signed).zip');
    expect(db.signedUrls[0].path).toBe(signedPath);
  });

  it('is null for another org’s document or one with no file', async () => {
    db.seed('order_documents', [docRow(), docRow({ id: 'skipped', status: 'skipped', storage_path: null })]);
    expect(await documentDownloadUrl('doc-1', OTHER_ORG_ID)).toBeNull();
    expect(await documentDownloadUrl('skipped', ORG_ID)).toBeNull();
    expect(db.signedUrls).toEqual([]);
  });

  it('throws when storage cannot mint a link', async () => {
    db.seed('order_documents', [docRow()]);
    await expect(documentDownloadUrl('doc-1', ORG_ID)).rejects.toThrow('documentDownloadUrl: Object not found');
  });
});

describe('markDocumentSigned', () => {
  async function seeded(over: Record<string, unknown> = {}) {
    db.seed('order_documents', [docRow(over)]);
    return (await getOrderDocument('doc-1', ORG_ID))!;
  }

  it('stores the signer’s copy beside the filled one, flips the row and records the event', async () => {
    const doc = await seeded({
      status: 'awaiting_signature',
      anvil_packet_eid: 'mock-packet-1',
      anvil_document_group_eid: 'mock-group-1',
      sign_url: '/orders/order-1/sign/doc-1?mock=1',
    });
    const signedPath = `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.doc-1.signed.pdf`;

    const out = await markDocumentSigned(doc, { userId: USER_ID });

    expect(out).toMatchObject({ status: 'signed', signedStoragePath: signedPath, signUrl: null });
    expect(row('doc-1')).toMatchObject({ status: 'signed', signed_storage_path: signedPath, sign_url: null });
    const stored = bucket().get(signedPath)!;
    expect(stored.contentType).toBe('application/pdf');
    expect(Buffer.from(stored.bytes).toString('latin1')).toContain('document group mock-group-1');
    expect(db.rows('events')).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        user_id: USER_ID,
        type: 'document_signed',
        payload: { orderId: 'order-1', documentId: 'doc-1', vendorId: 'omega', kind: 'rental_agreement' },
      }),
    ]);
  });

  it('points the signed copy at the filled file when there is no document group', async () => {
    const doc = await seeded({ status: 'awaiting_signature' });
    const out = await markDocumentSigned(doc);
    expect(out.signedStoragePath).toBe(doc.storagePath);
    expect(bucket().size).toBe(0);
    expect(db.rows('events')[0]).toMatchObject({ user_id: null, type: 'document_signed' });
  });

  it('leaves an already signed document alone', async () => {
    const doc = await seeded({ status: 'signed', signed_storage_path: 'x.pdf' });
    expect(await markDocumentSigned(doc)).toBe(doc);
    expect(db.log).toEqual([{ table: 'order_documents', op: 'select' }]);
    expect(db.rows('events')).toEqual([]);
  });

  it('throws without flipping the row when the signed copy cannot be stored', async () => {
    const doc = await seeded({ status: 'awaiting_signature', anvil_document_group_eid: 'mock-group-1' });
    db.failNextStorage('upload', 'bucket full');
    await expect(markDocumentSigned(doc)).rejects.toThrow('signed copy upload failed: bucket full');
    expect(row('doc-1').status).toBe('awaiting_signature');
    expect(db.rows('events')).toEqual([]);
  });

  it('throws when the row update fails', async () => {
    const doc = await seeded({ status: 'awaiting_signature' });
    db.failNext('order_documents', 'update', 'timeout');
    await expect(markDocumentSigned(doc)).rejects.toMatchObject({ message: 'timeout' });
    expect(db.rows('events')).toEqual([]);
  });

  it('throws when the row is gone', async () => {
    const doc = await seeded({ status: 'awaiting_signature' });
    db.rows('order_documents').length = 0;
    await expect(markDocumentSigned(doc)).rejects.toMatchObject({ code: 'PGRST116' });
  });
});

describe('findDocumentByPacket', () => {
  it('finds the row for an Anvil packet across orgs', async () => {
    db.seed('order_documents', [docRow({ anvil_packet_eid: 'pkt-1' }), docRow({ id: 'doc-2', org_id: OTHER_ORG_ID, anvil_packet_eid: 'pkt-2' })]);
    expect((await findDocumentByPacket('pkt-2'))?.orgId).toBe(OTHER_ORG_ID);
    expect(await findDocumentByPacket('pkt-none')).toBeNull();
  });

  it('throws on a database error', async () => {
    db.failNext('order_documents', 'select', 'boom');
    await expect(findDocumentByPacket('pkt-1')).rejects.toMatchObject({ message: 'boom' });
  });
});
