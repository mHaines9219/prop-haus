import { beforeEach, describe, expect, it, vi } from 'vitest';
import { params, rawRequest, readJson } from '@/test/helpers/request';
import { READY_PROFILE, orderItemRow, orderRow } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

const build = (id: string) => POST(rawRequest(`/api/orders/${id}/paperwork`, ''), params({ id }));

beforeEach(() => {
  delete process.env.FORMS_PROVIDER;
  delete process.env.FORMS;
  db.reset();
  signIn();
  db.relation('orders', 'order_items', 'order_id');
  db.seed('orders', [orderRow(), orderRow({ id: 'theirs', org_id: OTHER_ORG_ID, idempotency_key: 'idem-x' })]);
  db.seed('order_items', [orderItemRow(), orderItemRow({ id: 'oi-theirs', order_id: 'theirs' })]);
  db.seed('organizations', [{ id: ORG_ID, order_profile: READY_PROFILE }]);
  db.seed('vendor_forms', [
    {
      id: 'form-1',
      vendor_id: 'omega',
      kind: 'w9_request',
      label: 'W-9 request',
      anvil_template_eid: null,
      field_map: { companyName: 'company.legalName' },
      requires_signature: false,
      mode: 'auto',
      notes: null,
    },
  ]);
});

describe('POST /api/orders/[id]/paperwork', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await build('order-1');
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('builds the packet for the org’s order', async () => {
    const res = await build('order-1');
    expect(res.status).toBe(200);
    const { documents } = await readJson<{ documents: Array<Record<string, unknown>> }>(res);
    expect(documents).toEqual([expect.objectContaining({ orderId: 'order-1', vendorFormId: 'form-1', status: 'filled' })]);
    expect(db.rows('order_documents')).toHaveLength(1);
  });

  it('is idempotent: a second call returns the same documents and adds none', async () => {
    const first = await readJson<{ documents: Array<{ id: string }> }>(await build('order-1'));
    const second = await readJson<{ documents: Array<{ id: string }> }>(await build('order-1'));
    expect(second.documents.map((d) => d.id)).toEqual(first.documents.map((d) => d.id));
    expect(db.rows('order_documents')).toHaveLength(1);
  });

  it('404 for another org’s order, the same as an unknown one, building nothing', async () => {
    const theirs = await build('theirs');
    const unknown = await build('nope');
    expect([theirs.status, unknown.status]).toEqual([404, 404]);
    expect(await readJson(theirs)).toEqual(await readJson(unknown));
    expect(db.rows('order_documents')).toEqual([]);
  });
});
