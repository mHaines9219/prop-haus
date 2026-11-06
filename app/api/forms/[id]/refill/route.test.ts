import { beforeEach, describe, expect, it, vi } from 'vitest';
import { params, rawRequest, readJson } from '@/test/helpers/request';
import { READY_PROFILE, orderItemRow, orderRow } from '@/test/fixtures/orders';
import { orderDocumentRow } from '@/test/fixtures/order-documents';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

const refill = (id: string) => POST(rawRequest(`/api/forms/${id}/refill`, ''), params({ id }));
const doc = () => db.rows('order_documents')[0];

beforeEach(() => {
  delete process.env.FORMS_PROVIDER;
  db.reset();
  signIn();
  db.relation('orders', 'order_items', 'order_id');
  db.seed('orders', [orderRow()]);
  db.seed('order_items', [orderItemRow()]);
  db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
  db.seed('vendor_forms', [
    {
      id: 'form-1',
      vendor_id: 'omega',
      kind: 'rental_agreement',
      label: 'Rental agreement',
      anvil_template_eid: null,
      field_map: { companyName: 'company.legalName' },
      requires_signature: false,
      mode: 'auto',
      notes: null,
    },
  ]);
  db.seed('order_documents', [orderDocumentRow({ status: 'failed', storage_path: null, error: 'Fill failed: template missing' })]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/forms/[id]/refill', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await refill('doc-1');
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('re-fills the document from the current profile', async () => {
    const res = await refill('doc-1');
    expect(res.status).toBe(200);
    const { document } = await readJson<{ document: Record<string, unknown> }>(res);
    expect(document).toMatchObject({ id: 'doc-1', status: 'filled', error: null });
    expect(doc()).toMatchObject({ status: 'filled', storage_path: `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.doc-1.pdf` });
    expect(db.rows('order_documents')).toHaveLength(1);
  });

  it('404 for another org’s document, the same as an unknown one, leaving it alone', async () => {
    signIn({ orgId: OTHER_ORG_ID });
    const theirs = await refill('doc-1');
    const unknown = await refill('nope');
    expect([theirs.status, unknown.status]).toEqual([404, 404]);
    expect(await readJson(theirs)).toEqual(await readJson(unknown));
    expect(doc().status).toBe('failed');
  });

  it('409 for a signed document', async () => {
    doc().status = 'signed';
    const res = await refill('doc-1');
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'This document is already signed.' });
    expect(doc().status).toBe('signed');
  });

  it('500 without detail when the refill breaks', async () => {
    db.failNext('order_documents', 'upsert', 'disk full');
    const res = await refill('doc-1');
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'refill failed' });
    expect(console.error).toHaveBeenCalled();
  });
});
