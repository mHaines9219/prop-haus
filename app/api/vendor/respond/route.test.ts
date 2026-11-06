// POST /api/vendor/respond: the button behind the landing page. Writes the
// line through the real respond module against the in-memory database and
// lands back on the page with the outcome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formRequest, jsonRequest } from '@/test/helpers/request';
import { db } from '@/test/mocks/supabase-admin';
import { orderItemRow, orderRow } from '@/test/fixtures/orders';
import { claimsFor, signVendorAction } from '@/lib/vendor-links';
import { POST } from './route';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

let token = '';

function form(t?: string) {
  const f = new FormData();
  if (t !== undefined) f.set('t', t);
  return formRequest('/api/vendor/respond', f);
}

beforeEach(() => {
  vi.stubEnv('VENDOR_LINK_SECRET', 'test-secret');
  token = signVendorAction(claimsFor({ id: 'order-1' }, { id: 'oi-1', source: 'omega' }, 'available'));
  db.reset();
  db.relation('orders', 'order_items', 'order_id');
  db.seed('orders', [orderRow()]);
  db.seed('order_items', [orderItemRow()]);
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/vendor/respond', () => {
  it('records the answer and redirects to the page with r=changed', async () => {
    const res = await POST(form(token));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`http://localhost:3000/vendor/respond?t=${token}&r=changed`);
    expect(db.rows('order_items')[0]!.status).toBe('confirmed');
    expect(db.rows('events').map((e) => e.type)).toEqual(['vendor_replied']);
  });

  it('says so when nothing changed, and writes nothing more', async () => {
    await POST(form(token));
    const res = await POST(form(token));
    expect(res.headers.get('location')).toBe(`http://localhost:3000/vendor/respond?t=${token}&r=same`);
    expect(db.rows('events')).toHaveLength(1);
  });

  it('sends a bad token to the plain expired page without echoing it', async () => {
    const res = await POST(form('stale.token'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/vendor/respond');
    expect(db.rows('order_items')[0]!.status).toBe('pending');
  });

  it('lands on the page with r=error, never a 500, when the database fails', async () => {
    db.failNext('order_items', 'select', 'db down');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(form(token));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`http://localhost:3000/vendor/respond?t=${token}&r=error`);
    expect(db.rows('order_items')[0]!.status).toBe('pending');
    err.mockRestore();
  });

  it('rejects a body with no token, and a body that is not a form, with 400', async () => {
    expect((await POST(form())).status).toBe(400);
    expect((await POST(jsonRequest('/api/vendor/respond', { t: token }))).status).toBe(400);
    expect(db.rows('order_items')[0]!.status).toBe('pending');
  });
});
