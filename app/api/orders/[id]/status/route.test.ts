import { beforeEach, describe, expect, it, vi } from 'vitest';
import { params, rawRequest, readJson } from '@/test/helpers/request';
import { orderItemRow, orderRow } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { PATCH } from './route';

/**
 * The seam a vendor portal will write through. Org comes from the session, the
 * lib layer checks ownership per row, and anything unowned is a 404 so the
 * response never says whether an id exists.
 */

function patch(id: string, body: unknown) {
  return PATCH(rawRequest(`/api/orders/${id}/status`, typeof body === 'string' ? body : JSON.stringify(body), { method: 'PATCH' }), params({ id }));
}

function seedOrders() {
  db.seed('orders', [
    orderRow(),
    orderRow({ id: 'order-2', org_id: ORG_ID, idempotency_key: 'idem-2' }),
    orderRow({ id: 'theirs', org_id: OTHER_ORG_ID, idempotency_key: 'idem-3' }),
  ]);
  db.seed('order_items', [
    orderItemRow(),
    orderItemRow({ id: 'oi-2', order_id: 'order-1', item_id: 'omega-2' }),
    orderItemRow({ id: 'oi-theirs', order_id: 'theirs', item_id: 'omega-3' }),
  ]);
}

const order = (id: string) => db.rows('orders').find((r) => r.id === id)!;
const item = (id: string) => db.rows('order_items').find((r) => r.id === id)!;

beforeEach(() => {
  db.reset();
  signIn();
  db.relation('orders', 'order_items', 'order_id');
  seedOrders();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('refusals', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await patch('order-1', { status: 'confirmed' });
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('400 for malformed JSON', async () => {
    const res = await patch('order-1', '{nope');
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid JSON' });
    expect(db.log).toEqual([]);
  });

  it.each([[{}], [{ items: [] }], [{ status: '' }], [{ status: null, items: null }]])('400 with nothing to update: %j', async (body) => {
    const res = await patch('order-1', body);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'nothing to update' });
    expect(db.log).toEqual([]);
  });

  it.each(['shipped', 'PLACED', 42, true])('400 for order status %j, writing nothing', async (status) => {
    const res = await patch('order-1', { status });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: `invalid order status: ${status}` });
    expect(order('order-1').status).toBe('placed');
    expect(db.rows('events')).toEqual([]);
  });

  it.each([
    [{ id: 'oi-1', status: 'shipped' }],
    [{ id: 'oi-1', status: 7 }],
    [{ id: '', status: 'quoted' }],
    [{ status: 'quoted' }],
  ])('400 for item update %j, writing nothing', async (entry) => {
    const res = await patch('order-1', { items: [entry] });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: `invalid item status: ${entry.status}` });
    expect(item('oi-1').status).toBe('pending');
    expect(db.rows('events')).toEqual([]);
  });

  // Observed: the loop validates and writes one item at a time, so oi-1 is
  // already 'quoted' by the time oi-2's bad status answers 400.
  it.fails('validates every item before writing any', async () => {
    const res = await patch('order-1', {
      items: [
        { id: 'oi-1', status: 'quoted' },
        { id: 'oi-2', status: 'shipped' },
      ],
    });
    expect(res.status).toBe(400);
    expect(item('oi-1').status).toBe('pending');
  });

  it('400 when items is not an array', async () => {
    const res = await patch('order-1', { items: 'oi-1' });
    expect(res.status).toBe(400);
  });
});

describe('cross-org', () => {
  it('404 for another org’s order, leaving it untouched', async () => {
    const res = await patch('theirs', { status: 'cancelled' });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(order('theirs').status).toBe('placed');
    expect(db.rows('events')).toEqual([]);
  });

  it('404 for an item on another org’s order', async () => {
    const res = await patch('theirs', { items: [{ id: 'oi-theirs', status: 'confirmed' }] });
    expect(res.status).toBe(404);
    expect(item('oi-theirs').status).toBe('pending');
    expect(db.rows('events')).toEqual([]);
  });

  it('404 for an unknown order and an unknown item, identically', async () => {
    const a = await patch('nope', { status: 'confirmed' });
    const b = await patch('order-1', { items: [{ id: 'nope', status: 'confirmed' }] });
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await readJson(a)).toEqual(await readJson(b));
  });

  it('the org comes from the session, not the body', async () => {
    const res = await patch('theirs', { status: 'cancelled', org_id: OTHER_ORG_ID, orgId: OTHER_ORG_ID });
    expect(res.status).toBe(404);
  });
});

describe('order status', () => {
  it.each(['placed', 'processing', 'confirmed', 'cancelled'] as const)('moves the order to %s and records the event', async (status) => {
    const before = order('order-1').updated_at;
    const res = await patch('order-1', { status });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true });
    expect(order('order-1').status).toBe(status);
    expect(order('order-1').updated_at).not.toBe(before);
    expect(order('order-2').status).toBe('placed');
    expect(db.rows('events')).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        user_id: USER_ID,
        type: 'order_status_changed',
        payload: { orderId: 'order-1', status },
      }),
    ]);
  });
});

describe('item status', () => {
  it('writes status, note and quote for each item and records one event per item', async () => {
    const res = await patch('order-1', {
      items: [
        { id: 'oi-1', status: 'quoted', note: 'Two available', quotedCents: 9900 },
        { id: 'oi-2', status: 'unavailable' },
      ],
    });
    expect(res.status).toBe(200);
    expect(item('oi-1')).toMatchObject({ status: 'quoted', status_note: 'Two available', quoted_cents: 9900 });
    expect(item('oi-2')).toMatchObject({ status: 'unavailable', status_note: null, quoted_cents: null });
    expect(order('order-1').status).toBe('placed');
    expect(db.rows('events').map((e) => [e.type, e.payload])).toEqual([
      ['item_status_changed', { orderId: 'order-1', orderItemId: 'oi-1', status: 'quoted' }],
      ['item_status_changed', { orderId: 'order-1', orderItemId: 'oi-2', status: 'unavailable' }],
    ]);
  });

  it('clears an existing note when the update omits it', async () => {
    item('oi-1').status_note = 'old note';
    item('oi-1').quoted_cents = 100;
    await patch('order-1', { items: [{ id: 'oi-1', status: 'confirmed' }] });
    expect(item('oi-1')).toMatchObject({ status: 'confirmed', status_note: null, quoted_cents: null });
  });

  it('items first, then the order, in one request', async () => {
    const res = await patch('order-1', { status: 'confirmed', items: [{ id: 'oi-1', status: 'confirmed' }] });
    expect(res.status).toBe(200);
    expect(item('oi-1').status).toBe('confirmed');
    expect(order('order-1').status).toBe('confirmed');
    expect(db.rows('events').map((e) => e.type)).toEqual(['item_status_changed', 'order_status_changed']);
  });
});

describe('failures', () => {
  it('500 when the database fails for a reason other than ownership', async () => {
    db.failNext('orders', 'update', { code: '57014', message: 'statement timeout' });
    const res = await patch('order-1', { status: 'confirmed' });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'update failed' });
    expect(db.rows('events')).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('still answers ok when analytics is down', async () => {
    db.failNext('events', 'insert', 'events table on fire');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await patch('order-1', { status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(order('order-1').status).toBe('confirmed');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('order_status_changed'));
  });
});
