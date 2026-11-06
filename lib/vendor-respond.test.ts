/**
 * readVendorLink and respondToVendorLink: a read writes nothing, the answer
 * changes the line once, and nothing else on the order moves. The database is
 * the in-memory fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { orderItemRow, orderRow } from '@/test/fixtures/orders';
import { claimsFor, signVendorAction, verifyVendorAction, type VendorAction } from './vendor-links';
import { readVendorLink, respondToVendorLink } from './vendor-respond';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

const NOW = Date.parse('2026-11-06T12:00:00Z');

function tokenFor(action: VendorAction, over: { orderId?: string; itemId?: string; vendorId?: string } = {}) {
  const claims = claimsFor({ id: over.orderId ?? 'order-1' }, { id: over.itemId ?? 'oi-1', source: over.vendorId ?? 'omega' }, action, NOW);
  return signVendorAction(claims);
}

beforeEach(() => {
  vi.stubEnv('VENDOR_LINK_SECRET', 'test-secret');
  db.reset();
  db.relation('orders', 'order_items', 'order_id');
  db.seed('orders', [orderRow(), orderRow({ id: 'order-2', idempotency_key: 'idem-2', sandbox: true })]);
  db.seed('order_items', [orderItemRow(), orderItemRow({ id: 'oi-2', order_id: 'order-2', name: 'Lamp' })]);
  db.seed('order_bookings', [{ id: 'b-1', order_id: 'order-2', vendor_id: 'omega', stage: 'inquiry_sent' }]);
});
afterEach(() => vi.unstubAllEnvs());

describe('readVendorLink', () => {
  it('names the line and the answer, writes nothing, and signs the flip with the same expiry', async () => {
    const read = await readVendorLink(tokenFor('available'), NOW);
    expect(read).toMatchObject({
      ok: true,
      orgId: ORG_ID,
      line: { vendorName: 'Omega Cinema Props', itemName: 'Mid-century walnut credenza', status: 'pending', action: 'available', flip: { action: 'unavailable' } },
    });
    if (!read.ok) throw new Error('expected ok');
    const flip = verifyVendorAction(new URL(read.line.flip.url).searchParams.get('t')!, NOW);
    expect(flip).toEqual({ ok: true, claims: { ...read.claims, action: 'unavailable' } });
    expect(db.log.every((l) => l.op === 'select')).toBe(true);
    expect(db.rows('events')).toEqual([]);
  });

  it('refuses a bad or expired token before touching the database', async () => {
    expect(await readVendorLink('nope', NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(await readVendorLink(tokenFor('available'), NOW + 31 * 86400_000)).toEqual({ ok: false, reason: 'expired' });
    expect(db.log).toEqual([]);
  });

  it("refuses a token whose order does not own the line, or whose vendor is another house", async () => {
    expect(await readVendorLink(tokenFor('available', { orderId: 'order-2' }), NOW)).toEqual({ ok: false, reason: 'not_found' });
    expect(await readVendorLink(tokenFor('available', { vendorId: 'hpr' }), NOW)).toEqual({ ok: false, reason: 'not_found' });
    expect(await readVendorLink(tokenFor('available', { itemId: 'nope' }), NOW)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('respondToVendorLink', () => {
  it('marks the line confirmed for "available" and records one event', async () => {
    const result = await respondToVendorLink(tokenFor('available'), NOW);
    expect(result).toMatchObject({ ok: true, changed: true, line: { status: 'confirmed', action: 'available' } });
    expect(db.rows('order_items')[0]!.status).toBe('confirmed');
    expect(db.rows('events')).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        type: 'vendor_replied',
        payload: { orderId: 'order-1', orderItemId: 'oi-1', vendorId: 'omega', action: 'available', status: 'confirmed' },
      }),
    ]);
  });

  it('marks the line unavailable for "unavailable"', async () => {
    const result = await respondToVendorLink(tokenFor('unavailable'), NOW);
    expect(result).toMatchObject({ ok: true, changed: true, line: { status: 'unavailable' } });
    expect(db.rows('order_items')[0]!.status).toBe('unavailable');
  });

  it('is idempotent: the same answer twice writes nothing the second time', async () => {
    await respondToVendorLink(tokenFor('available'), NOW);
    const writes = db.log.filter((l) => l.op === 'update').length;
    const again = await respondToVendorLink(tokenFor('available'), NOW);
    expect(again).toMatchObject({ ok: true, changed: false, line: { status: 'confirmed' } });
    expect(db.log.filter((l) => l.op === 'update').length).toBe(writes);
    expect(db.rows('events')).toHaveLength(1);
  });

  it('lets the latest answer win when the vendor flips, through the flip link', async () => {
    const first = await respondToVendorLink(tokenFor('available'), NOW);
    if (!first.ok) throw new Error('expected ok');
    const flipToken = new URL(first.line.flip.url).searchParams.get('t')!;
    const second = await respondToVendorLink(flipToken, NOW);
    expect(second).toMatchObject({ ok: true, changed: true, line: { action: 'unavailable', status: 'unavailable', flip: { action: 'available' } } });
    expect(db.rows('order_items')[0]!.status).toBe('unavailable');
    expect(db.rows('events').map((e) => (e.payload as { action: string }).action)).toEqual(['available', 'unavailable']);
  });

  it('writes nothing for a foreign, bad or expired token', async () => {
    expect(await respondToVendorLink(tokenFor('available', { orderId: 'order-2' }), NOW)).toEqual({ ok: false, reason: 'not_found' });
    expect(await respondToVendorLink('nope', NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(db.rows('order_items').map((r) => r.status)).toEqual(['pending', 'pending']);
    expect(db.rows('events')).toEqual([]);
  });

  it('sets only the line status on a sandbox order and never touches a booking stage', async () => {
    const result = await respondToVendorLink(tokenFor('available', { orderId: 'order-2', itemId: 'oi-2' }), NOW);
    expect(result).toMatchObject({ ok: true, changed: true, line: { status: 'confirmed' } });
    expect(db.rows('order_items')[1]!.status).toBe('confirmed');
    expect(db.rows('order_bookings')[0]!.stage).toBe('inquiry_sent');
    expect(db.rows('orders').map((o) => o.status)).toEqual(['placed', 'placed']);
    expect(db.log.some((l) => l.table === 'order_bookings')).toBe(false);
    expect(db.rows('events').map((e) => e.type)).toEqual(['vendor_replied']);
  });

  it('rethrows a database failure so the page can say it did not go through', async () => {
    db.failNext('order_items', 'select', 'boom');
    await expect(respondToVendorLink(tokenFor('available'), NOW)).rejects.toMatchObject({ message: 'boom' });
  });
});
