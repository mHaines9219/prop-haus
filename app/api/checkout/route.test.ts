import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { makeCartLine, READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
vi.mock('@/lib/spacelab/handoff', () => ({ queueSpacelabHandoff: vi.fn(async () => undefined) }));
vi.mock('@/lib/forms/packet', () => ({ buildOrderPaperwork: vi.fn(async () => []) }));

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { afterCalls, flushAfter, resetAfter } from '@/test/mocks/next-server';
import { queueSpacelabHandoff } from '@/lib/spacelab/handoff';
import { buildOrderPaperwork } from '@/lib/forms/packet';
import { paymentProvider } from '@/lib/payments/provider';
import { POST } from './route';

/**
 * The one click. Everything the order needs comes from the profile, so the
 * interesting cases are the refusals (no session, no key, empty cart, profile
 * not ready) and what the click does beyond the insert: snapshots the lines,
 * fills defaults, records the event, schedules the set preview, and stays
 * idempotent under a double-click.
 */

function seedOrg(profile: unknown = READY_PROFILE) {
  db.seed('organizations', [{ id: ORG_ID, order_profile: profile }]);
}

beforeEach(() => {
  db.reset();
  resetAfter();
  signIn();
  db.relation('orders', 'order_items', 'order_id');
  db.unique('orders', ['org_id', 'idempotency_key']);
  vi.mocked(queueSpacelabHandoff).mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const body = { lines: [makeCartLine()], idempotencyKey: 'click-1' };

describe('refusals', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('400 without an idempotency key', async () => {
    seedOrg();
    const res = await POST(jsonRequest('/api/checkout', { lines: body.lines }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'idempotencyKey is required' });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it.each([[[]], [undefined], ['not-an-array']])('400 when lines is %j', async (lines) => {
    seedOrg();
    const res = await POST(jsonRequest('/api/checkout', { lines, idempotencyKey: 'k' }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'cart is empty' });
  });

  it('422 with the exact gaps when the profile is not ready', async () => {
    seedOrg({ ...READY_PROFILE, company: {}, authorization: { formsOnBehalf: false } });
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(422);
    expect(await readJson(res)).toEqual({
      error: 'order profile is incomplete',
      missing: ['Company legal name', 'Authorization to complete forms'],
    });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('422 when the org has no profile row at all', async () => {
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(422);
  });

  it('rejects a malformed JSON body rather than placing an order', async () => {
    seedOrg();
    await expect(POST(rawRequest('/api/checkout', '{not json'))).rejects.toThrow();
    expect(db.rows('orders')).toHaveLength(0);
  });
});

describe('the click', () => {
  it('places the order with lines snapshotted and profile defaults filled in', async () => {
    seedOrg();
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(201);
    const { id } = await readJson<{ id: string }>(res);

    const [order] = db.rows('orders');
    expect(order).toMatchObject({
      id,
      org_id: ORG_ID,
      status: 'placed',
      idempotency_key: 'click-1',
      delivery_address: READY_PROFILE.defaults.deliveryAddress,
      delivery_notes: null,
    });
    // Profile window: next business day + 7 days.
    expect(order.rental_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(order.rental_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((order.rental_end as string) > (order.rental_start as string)).toBe(true);

    expect(db.rows('order_items')).toEqual([
      expect.objectContaining({
        order_id: id,
        item_id: 'omega-12345',
        source: 'omega',
        source_id: '12345',
        vendor: 'Omega Cinema Props',
        price_cents: 12000,
        image: 'https://omegacinemaprops.com/img/12345.jpg',
      }),
    ]);
  });

  it('lets the body override dates, address and notes when the UI sends them', async () => {
    seedOrg();
    await POST(
      jsonRequest('/api/checkout', {
        ...body,
        rentalStart: '2026-10-01',
        rentalEnd: '2026-10-03',
        deliveryAddress: { line1: '1 Stage Rd', city: 'LA', state: 'CA', zip: '90028', junk: 'x' },
        deliveryNotes: '  gate code 4321  ',
      }),
    );
    expect(db.rows('orders')[0]).toMatchObject({
      rental_start: '2026-10-01',
      rental_end: '2026-10-03',
      delivery_address: { line1: '1 Stage Rd', city: 'LA', state: 'CA', zip: '90028' },
      delivery_notes: 'gate code 4321',
    });
  });

  it('falls back to the profile address when the body address is unusable', async () => {
    seedOrg();
    await POST(jsonRequest('/api/checkout', { ...body, deliveryAddress: 'not an address', deliveryNotes: '   ' }));
    expect(db.rows('orders')[0]).toMatchObject({
      delivery_address: READY_PROFILE.defaults.deliveryAddress,
      delivery_notes: null,
    });
  });

  it('records order_placed with item and vendor counts', async () => {
    seedOrg();
    await POST(
      jsonRequest('/api/checkout', {
        ...body,
        lines: [
          makeCartLine({ itemId: 'a', vendor: 'Omega' }),
          makeCartLine({ itemId: 'b', vendor: 'Omega' }),
          makeCartLine({ itemId: 'c', vendor: 'Newel' }),
        ],
      }),
    );
    expect(db.rows('events')).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        type: 'order_placed',
        payload: { orderId: db.rows('orders')[0].id, itemCount: 3, vendorCount: 2 },
      }),
    ]);
  });

  it('schedules the Spacelab handoff after the response, not inline', async () => {
    seedOrg();
    await POST(jsonRequest('/api/checkout', body));
    expect(queueSpacelabHandoff).not.toHaveBeenCalled();
    expect(afterCalls).toHaveLength(3);
    await flushAfter();
    expect(queueSpacelabHandoff).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG_ID }), ORG_ID);
  });

  it('authorizes payment only when the order carries a total', async () => {
    seedOrg();
    const authorize = vi.spyOn(paymentProvider, 'authorize');
    await POST(jsonRequest('/api/checkout', body));
    expect(authorize).not.toHaveBeenCalled();

    db.reset();
    db.relation('orders', 'order_items', 'order_id');
    db.unique('orders', ['org_id', 'idempotency_key']);
    seedOrg();
    db.seed('orders', [{ id: 'pre', org_id: ORG_ID, idempotency_key: 'paid', total_cents: 5000, status: 'placed' }]);
    // A replay of an order that already has a total exercises the authorize path.
    await POST(jsonRequest('/api/checkout', { ...body, idempotencyKey: 'paid' }));
    expect(authorize).toHaveBeenCalledWith({ orderId: 'pre', amountCents: 5000, currency: 'usd' });
  });

  it('still answers 201 when analytics is down', async () => {
    seedOrg();
    db.failNext('events', 'insert', 'events table on fire');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(201);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('order_placed'));
  });
});

describe('paperwork (MVP-12)', () => {
  it('fills the vendor paperwork after the response, with the org and plan', async () => {
    seedOrg();
    vi.mocked(buildOrderPaperwork).mockClear();
    await POST(jsonRequest('/api/checkout', body));
    expect(buildOrderPaperwork).not.toHaveBeenCalled();
    await flushAfter();
    expect(buildOrderPaperwork).toHaveBeenCalledWith(db.rows('orders')[0].id, ORG_ID, 'free');
  });

  it('skips the paperwork when FORMS=off', async () => {
    seedOrg();
    vi.mocked(buildOrderPaperwork).mockClear();
    vi.stubEnv('FORMS', 'off');
    try {
      await POST(jsonRequest('/api/checkout', body));
      await flushAfter();
    } finally {
      vi.unstubAllEnvs();
    }
    expect(buildOrderPaperwork).not.toHaveBeenCalled();
  });
});

describe('idempotency', () => {
  it('a second click with the same key returns the same order and adds no lines', async () => {
    seedOrg();
    const first = await readJson<{ id: string }>(await POST(jsonRequest('/api/checkout', body)));
    const second = await readJson<{ id: string }>(await POST(jsonRequest('/api/checkout', body)));
    expect(second.id).toBe(first.id);
    expect(db.rows('orders')).toHaveLength(1);
    expect(db.rows('order_items')).toHaveLength(1);
  });

  it('the same key under another org is a different order', async () => {
    seedOrg();
    db.seed('organizations', [{ id: OTHER_ORG_ID, order_profile: READY_PROFILE }]);
    const a = await readJson<{ id: string }>(await POST(jsonRequest('/api/checkout', body)));
    signIn({ orgId: OTHER_ORG_ID, userId: 'other-user' });
    const b = await readJson<{ id: string }>(await POST(jsonRequest('/api/checkout', body)));
    expect(a.id).not.toBe(b.id);
    expect(db.rows('orders')).toHaveLength(2);
  });

  it('surfaces a non-duplicate insert failure instead of swallowing it', async () => {
    seedOrg();
    db.failNext('orders', 'insert', { code: '57014', message: 'statement timeout' });
    await expect(POST(jsonRequest('/api/checkout', body))).rejects.toMatchObject({ message: 'statement timeout' });
  });
});
