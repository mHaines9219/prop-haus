import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { orderItemRow, orderRow } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { getOrderById } from '@/lib/orders';
import { openBookings } from '@/lib/booking/store';
import { POST } from './route';

// The sandbox's manual advance, as the order page calls it.

const URL = '/api/orders/order-1/bookings/omega';
const ctx = (id = 'order-1', vendorId = 'omega') => ({ params: Promise.resolve({ id, vendorId }) });
const post = (body: unknown, c = ctx()) => POST(jsonRequest(URL, body), c);

beforeEach(async () => {
  db.reset();
  db.relation('orders', 'order_items', 'order_id');
  signIn({ isAdmin: true });
  db.seed('organizations', [{ id: ORG_ID, order_profile: {}, passport: {} }]);
  db.seed('orders', [orderRow({ sandbox: true })]);
  db.seed('order_items', [orderItemRow()]);
  await openBookings(await getOrderById('order-1', ORG_ID));
});

describe('POST /api/orders/[id]/bookings/[vendorId]', () => {
  it('401 signed out; 400 without an event or with a body that is not JSON', async () => {
    signOut();
    expect((await post({ event: 'confirm', amountCents: 1_000 })).status).toBe(401);
    signIn({ isAdmin: true });
    expect((await post({})).status).toBe(400);
    expect((await POST(rawRequest(URL, 'nope'), ctx())).status).toBe(400);
  });

  it('applies the event and answers with every booking on the order', async () => {
    const res = await post({ event: 'confirm', amountCents: 27_000 });
    expect(res.status).toBe(200);
    const { bookings } = await readJson<{ bookings: { vendorId: string; stage: string; amountCents: number }[] }>(res);
    expect(bookings).toEqual([expect.objectContaining({ vendorId: 'omega', stage: 'confirmed', amountCents: 27_000 })]);
  });

  it('maps each refusal to its status and says why', async () => {
    const outOfOrder = await post({ event: 'capture' });
    expect(outOfOrder.status).toBe(409);
    expect(await readJson(outOfOrder)).toMatchObject({ reason: 'invalid_transition' });

    expect((await post({ event: 'confirm', amountCents: -5 })).status).toBe(400);
    expect((await post({ event: 'teleport' })).status).toBe(400);
    expect((await post({ event: 'confirm', amountCents: 1_000 }, ctx('order-1', 'hpr'))).status).toBe(404);

    signIn({ isAdmin: true, orgId: OTHER_ORG_ID });
    expect((await post({ event: 'confirm', amountCents: 1_000 })).status).toBe(404);
  });

  it('403 for a member of the same org who is not an admin', async () => {
    signIn();
    expect((await post({ event: 'confirm', amountCents: 1_000 })).status).toBe(403);
    expect(db.rows('order_bookings')[0].stage).toBe('inquiry_sent');
  });

  it('409 for an order that was not placed in the sandbox', async () => {
    db.rows('orders')[0].sandbox = false;
    const res = await post({ event: 'confirm', amountCents: 1_000 });
    expect(res.status).toBe(409);
    expect(await readJson(res)).toMatchObject({ reason: 'not_sandbox' });
    expect(db.rows('order_bookings')[0].stage).toBe('inquiry_sent');
  });
});
