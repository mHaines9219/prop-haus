import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCartLine, makeOrder, makeOrderItem, orderItemRow, orderRow } from '@/test/fixtures/orders';

/**
 * Orders are the record the click leaves behind. What matters: a double-click
 * replays instead of duplicating, every read and write is org-scoped, a line
 * can only be flipped by the org that owns its order, and nulls in the row
 * never become `undefined` keys in the object.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { createOrder, getOrderById, listOrders, setItemStatus, setOrderStatus, summarizeOrder } from './orders';

beforeEach(() => {
  db.reset();
  db.relation('orders', 'order_items', 'order_id');
  db.unique('orders', ['org_id', 'idempotency_key']);
});

const INPUT = {
  orgId: ORG_ID,
  lines: [makeCartLine()],
  rentalStart: '2026-09-07',
  rentalEnd: '2026-09-14',
  deliveryAddress: { line1: '4100 W Alameda Ave', city: 'Burbank', state: 'CA', zip: '91505' },
  deliveryNotes: 'gate code 4321',
  idempotencyKey: 'click-1',
};

describe('createOrder', () => {
  it('writes the order row and one snapshot row per line, then returns the aggregate', async () => {
    const order = await createOrder(INPUT);
    expect(order).toMatchObject({
      orgId: ORG_ID,
      status: 'placed',
      rentalStart: '2026-09-07',
      rentalEnd: '2026-09-14',
      deliveryAddress: INPUT.deliveryAddress,
      deliveryNotes: 'gate code 4321',
    });
    expect(order.items).toEqual([
      expect.objectContaining({
        itemId: 'omega-12345',
        source: 'omega',
        sourceId: '12345',
        name: 'Mid-century walnut credenza',
        image: 'https://omegacinemaprops.com/img/12345.jpg',
        vendor: 'Omega Cinema Props',
        priceCents: 12000,
        status: 'pending',
      }),
    ]);
    expect(db.rows('orders')[0]).toMatchObject({ id: order.id, org_id: ORG_ID, idempotency_key: 'click-1' });
    expect(db.rows('order_items')[0]).toMatchObject({ order_id: order.id, image: 'https://omegacinemaprops.com/img/12345.jpg', price_cents: 12000 });
  });

  it('stores nulls for the optional fields it was not given', async () => {
    await createOrder({ orgId: ORG_ID, lines: [makeCartLine({ image: undefined, priceCents: undefined })], idempotencyKey: 'k' });
    expect(db.rows('orders')[0]).toMatchObject({ rental_start: null, rental_end: null, delivery_address: null, delivery_notes: null });
    expect(db.rows('order_items')[0]).toMatchObject({ image: null, price_cents: null });
  });

  it('skips the line insert entirely for an empty cart', async () => {
    const order = await createOrder({ ...INPUT, lines: [] });
    expect(order.items).toEqual([]);
    expect(db.log.some((l) => l.table === 'order_items')).toBe(false);
  });

  it('replays the same order on a duplicate key without adding lines', async () => {
    const first = await createOrder(INPUT);
    db.log.length = 0;
    const second = await createOrder({ ...INPUT, lines: [makeCartLine(), makeCartLine({ itemId: 'x' })] });
    expect(second.id).toBe(first.id);
    expect(second.items).toHaveLength(1);
    expect(db.rows('orders')).toHaveLength(1);
    expect(db.rows('order_items')).toHaveLength(1);
    expect(db.log).toEqual([
      { table: 'orders', op: 'insert' },
      { table: 'orders', op: 'select' },
    ]);
  });

  it('treats the same key under another org as a new order', async () => {
    const a = await createOrder(INPUT);
    const b = await createOrder({ ...INPUT, orgId: OTHER_ORG_ID });
    expect(a.id).not.toBe(b.id);
    expect(b.orgId).toBe(OTHER_ORG_ID);
    expect(db.rows('orders')).toHaveLength(2);
  });

  it('rethrows a non-duplicate insert failure', async () => {
    db.failNext('orders', 'insert', { code: '57014', message: 'statement timeout' });
    await expect(createOrder(INPUT)).rejects.toMatchObject({ code: '57014', message: 'statement timeout' });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('rethrows a line insert failure', async () => {
    db.failNext('order_items', 'insert', { code: '23514', message: 'check violation' });
    await expect(createOrder(INPUT)).rejects.toMatchObject({ message: 'check violation' });
  });
});

describe('getOrderById', () => {
  beforeEach(() => {
    db.seed('orders', [orderRow()]);
    db.seed('order_items', [orderItemRow()]);
  });

  it('returns the order with its lines', async () => {
    await expect(getOrderById('order-1', ORG_ID)).resolves.toEqual(makeOrder());
  });

  it('is a not-found error for another org, indistinguishable from a missing id', async () => {
    await expect(getOrderById('order-1', OTHER_ORG_ID)).rejects.toMatchObject({ code: 'PGRST116' });
    await expect(getOrderById('nope', ORG_ID)).rejects.toMatchObject({ code: 'PGRST116' });
  });

  it('rethrows a read failure', async () => {
    db.failNext('orders', 'select', 'connection reset');
    await expect(getOrderById('order-1', ORG_ID)).rejects.toMatchObject({ message: 'connection reset' });
  });
});

describe('row mapping', () => {
  it('drops null columns instead of carrying undefined keys', async () => {
    db.seed('orders', [
      orderRow({ rental_start: null, rental_end: null, delivery_address: null, delivery_notes: null, total_cents: null }),
    ]);
    db.seed('order_items', [orderItemRow({ image: null, price_cents: null, status_note: null, quoted_cents: null })]);
    const order = await getOrderById('order-1', ORG_ID);
    expect(order).toEqual({
      id: 'order-1',
      orgId: ORG_ID,
      status: 'placed',
      items: [
        {
          id: 'oi-1',
          itemId: 'omega-12345',
          source: 'omega',
          sourceId: '12345',
          name: 'Mid-century walnut credenza',
          sourceUrl: 'https://omegacinemaprops.com/item/12345',
          vendor: 'Omega Cinema Props',
          status: 'pending',
        },
      ],
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
    });
  });

  it('keeps zero amounts and carries notes, quotes and totals', async () => {
    db.seed('orders', [orderRow({ total_cents: 0 })]);
    db.seed('order_items', [orderItemRow({ price_cents: 0, quoted_cents: 0, status_note: 'call first', status: 'quoted' })]);
    const order = await getOrderById('order-1', ORG_ID);
    expect(order.totalCents).toBe(0);
    expect(order.items[0]).toMatchObject({ priceCents: 0, quotedCents: 0, statusNote: 'call first', status: 'quoted' });
  });

  it('defaults a missing item status to pending and no lines to an empty list', async () => {
    db.seed('orders', [orderRow()]);
    db.seed('order_items', [orderItemRow({ status: null })]);
    expect((await getOrderById('order-1', ORG_ID)).items[0].status).toBe('pending');

    db.seed('orders', [orderRow({ id: 'order-2', idempotency_key: 'idem-2' })]);
    expect((await getOrderById('order-2', ORG_ID)).items).toEqual([]);
  });
});

describe('listOrders', () => {
  it('returns the org’s orders newest first, with lines', async () => {
    db.seed('orders', [
      orderRow({ id: 'old', idempotency_key: 'a', created_at: '2026-09-01T00:00:00Z' }),
      orderRow({ id: 'new', idempotency_key: 'b', created_at: '2026-09-03T00:00:00Z' }),
      orderRow({ id: 'mid', idempotency_key: 'c', created_at: '2026-09-02T00:00:00Z' }),
      orderRow({ id: 'theirs', org_id: OTHER_ORG_ID, idempotency_key: 'd', created_at: '2026-09-04T00:00:00Z' }),
    ]);
    db.seed('order_items', [orderItemRow({ order_id: 'new' })]);
    const orders = await listOrders(ORG_ID);
    expect(orders.map((o) => o.id)).toEqual(['new', 'mid', 'old']);
    expect(orders[0].items).toHaveLength(1);
    expect(orders[1].items).toEqual([]);
  });

  it('is empty for an org with nothing', async () => {
    await expect(listOrders(ORG_ID)).resolves.toEqual([]);
  });

  it('rethrows a read failure', async () => {
    db.failNext('orders', 'select', 'boom');
    await expect(listOrders(ORG_ID)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('setOrderStatus', () => {
  beforeEach(() => {
    db.seed('orders', [orderRow()]);
  });

  it('updates the status and bumps updated_at', async () => {
    await setOrderStatus('order-1', ORG_ID, 'confirmed');
    const row = db.rows('orders')[0];
    expect(row.status).toBe('confirmed');
    expect(row.updated_at).not.toBe('2026-09-02T10:00:00.000Z');
  });

  it('throws when the order is missing or belongs to another org', async () => {
    await expect(setOrderStatus('nope', ORG_ID, 'cancelled')).rejects.toThrow('Order not found');
    await expect(setOrderStatus('order-1', OTHER_ORG_ID, 'cancelled')).rejects.toThrow('Order not found');
    expect(db.rows('orders')[0].status).toBe('placed');
  });

  it('rethrows a write failure', async () => {
    db.failNext('orders', 'update', 'boom');
    await expect(setOrderStatus('order-1', ORG_ID, 'processing')).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('setItemStatus', () => {
  beforeEach(() => {
    db.seed('orders', [orderRow(), orderRow({ id: 'theirs', org_id: OTHER_ORG_ID, idempotency_key: 'x' })]);
    db.seed('order_items', [
      orderItemRow({ status_note: 'keep me', quoted_cents: 999 }),
      orderItemRow({ id: 'oi-2', name: 'Lamp' }),
      orderItemRow({ id: 'oi-theirs', order_id: 'theirs' }),
    ]);
  });

  it('refuses a line whose parent order belongs to another org', async () => {
    await expect(setItemStatus('oi-theirs', ORG_ID, 'confirmed')).rejects.toThrow('Order item not found');
    await expect(setItemStatus('oi-1', OTHER_ORG_ID, 'confirmed')).rejects.toThrow('Order item not found');
    expect(db.rows('order_items').map((r) => r.status)).toEqual(['pending', 'pending', 'pending']);
    expect(db.log.some((l) => l.op === 'update')).toBe(false);
  });

  it('refuses an unknown line', async () => {
    await expect(setItemStatus('nope', ORG_ID, 'confirmed')).rejects.toThrow('Order item not found');
  });

  it('writes only the status when no options are given', async () => {
    await setItemStatus('oi-1', ORG_ID, 'confirmed');
    expect(db.rows('order_items')[0]).toMatchObject({ status: 'confirmed', status_note: 'keep me', quoted_cents: 999 });
    expect(db.rows('order_items')[1].status).toBe('pending');
  });

  it('writes the note and quote when the keys are present, including explicit nulls', async () => {
    await setItemStatus('oi-1', ORG_ID, 'quoted', { note: 'ships Monday', quotedCents: 4500 });
    expect(db.rows('order_items')[0]).toMatchObject({ status: 'quoted', status_note: 'ships Monday', quoted_cents: 4500 });

    await setItemStatus('oi-1', ORG_ID, 'pending', { note: null, quotedCents: null });
    expect(db.rows('order_items')[0]).toMatchObject({ status: 'pending', status_note: null, quoted_cents: null });
  });

  it('treats a present-but-undefined key as clearing the field', async () => {
    await setItemStatus('oi-1', ORG_ID, 'confirmed', { note: undefined });
    expect(db.rows('order_items')[0]).toMatchObject({ status_note: null, quoted_cents: 999 });
  });

  it('leaves the other field alone when only one key is given', async () => {
    await setItemStatus('oi-1', ORG_ID, 'quoted', { quotedCents: 100 });
    expect(db.rows('order_items')[0]).toMatchObject({ status_note: 'keep me', quoted_cents: 100 });
  });

  it('rethrows failures from the ownership check and the write', async () => {
    db.failNext('order_items', 'select', 'boom');
    await expect(setItemStatus('oi-1', ORG_ID, 'confirmed')).rejects.toMatchObject({ message: 'boom' });
    db.failNext('order_items', 'update', 'write boom');
    await expect(setItemStatus('oi-1', ORG_ID, 'confirmed')).rejects.toMatchObject({ message: 'write boom' });
  });
});

describe('summarizeOrder', () => {
  it('is empty for an order with no lines', () => {
    expect(summarizeOrder(makeOrder({ items: [] }))).toEqual([]);
  });

  it('counts each status per vendor and sorts vendors by name', () => {
    const order = makeOrder({
      items: [
        makeOrderItem({ id: '1', vendor: 'Newel', status: 'confirmed' }),
        makeOrderItem({ id: '2', vendor: 'Newel', status: 'confirmed' }),
        makeOrderItem({ id: '3', vendor: 'Newel', status: 'pending' }),
        makeOrderItem({ id: '4', vendor: 'Newel', status: 'unavailable' }),
        makeOrderItem({ id: '5', vendor: 'Alley Cats', status: 'quoted' }),
        makeOrderItem({ id: '6', vendor: 'omega lower', status: 'pending' }),
      ],
    });
    expect(summarizeOrder(order)).toEqual([
      { vendor: 'Alley Cats', total: 1, pending: 0, quoted: 1, confirmed: 0, unavailable: 0 },
      { vendor: 'Newel', total: 4, pending: 1, quoted: 0, confirmed: 2, unavailable: 1 },
      { vendor: 'omega lower', total: 1, pending: 1, quoted: 0, confirmed: 0, unavailable: 0 },
    ]);
  });
});
