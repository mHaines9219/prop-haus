import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest, params, readJson } from '@/test/helpers/request';
import { orderDocumentRow } from '@/test/fixtures/order-documents';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { GET } from './route';

const download = (id: string) => GET(getRequest(`/api/forms/${id}/download`), params({ id }));
const FILLED = `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.pdf`;

beforeEach(() => {
  db.reset();
  signIn();
  db.seed('order_documents', [orderDocumentRow(), orderDocumentRow({ id: 'skipped', status: 'skipped', storage_path: null })]);
  db.bucket('paperwork').set(FILLED, { bytes: new Uint8Array([1]), contentType: 'application/pdf' });
});

describe('GET /api/forms/[id]/download', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await download('doc-1');
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('redirects to a short-lived, uncached link for the filled PDF', async () => {
    const res = await download('doc-1');
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe(`/paperwork/${FILLED}`);
    expect(location.searchParams.get('download')).toBe('Rental agreement.pdf');
    expect(db.signedUrls[0].expiresIn).toBe(60);
  });

  it('serves the signed copy once there is one', async () => {
    const signed = `orgs/${ORG_ID}/orders/order-1/omega/rental_agreement.signed.pdf`;
    db.rows('order_documents')[0].signed_storage_path = signed;
    db.bucket('paperwork').set(signed, { bytes: new Uint8Array([2]) });
    const res = await download('doc-1');
    expect(new URL(res.headers.get('location')!).searchParams.get('download')).toBe('Rental agreement (signed).pdf');
  });

  it('404 for another org’s document, the same as an unknown one', async () => {
    signIn({ orgId: OTHER_ORG_ID });
    const theirs = await download('doc-1');
    const unknown = await download('nope');
    expect([theirs.status, unknown.status]).toEqual([404, 404]);
    expect(await readJson(theirs)).toEqual(await readJson(unknown));
    expect(db.signedUrls).toEqual([]);
  });

  it('404 for a document with no file', async () => {
    expect((await download('skipped')).status).toBe(404);
  });
});
