import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, readJson } from '@/test/helpers/request';
import { orderDocumentRow } from '@/test/fixtures/order-documents';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET } from './route';

type Body = { documents: Array<{ id: string; orderId: string; status: string }> };

beforeEach(() => {
  db.reset();
  signIn();
  db.seed('order_documents', [
    orderDocumentRow(),
    orderDocumentRow({ id: 'doc-2', kind: 'coi_request', label: 'COI request', created_at: '2026-09-03T00:00:00Z' }),
    orderDocumentRow({ id: 'doc-other-order', order_id: 'order-2' }),
    orderDocumentRow({ id: 'doc-theirs', org_id: OTHER_ORG_ID }),
  ]);
});

describe('GET /api/forms', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await GET(getRequest('/api/forms?orderId=order-1'));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('400 without an orderId', async () => {
    const res = await GET(getRequest('/api/forms'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'orderId is required' });
    expect(db.log).toEqual([]);
  });

  it('lists the paperwork on one of the org’s orders', async () => {
    const res = await GET(getRequest('/api/forms?orderId=order-1'));
    expect(res.status).toBe(200);
    const { documents } = await readJson<Body>(res);
    expect(documents.map((d) => d.id)).toEqual(['doc-1', 'doc-2']);
    expect(documents[0]).toMatchObject({ orderId: 'order-1', status: 'filled' });
  });

  it('shows another org’s paperwork as an empty list, the same as an unknown order', async () => {
    signIn({ orgId: OTHER_ORG_ID });
    const theirs = await readJson<Body>(await GET(getRequest('/api/forms?orderId=order-2')));
    const unknown = await readJson<Body>(await GET(getRequest('/api/forms?orderId=nope')));
    expect(theirs).toEqual({ documents: [] });
    expect(unknown).toEqual({ documents: [] });
  });
});
