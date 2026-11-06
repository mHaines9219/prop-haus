import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orderItemRow, orderRow } from '@/test/fixtures/orders';

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { getOrderById } from '@/lib/orders';
import { advanceBooking, listBookings, openBookings } from './store';

/**
 * A sandbox order with two houses, walked the way the order page walks it:
 * open at checkout, then one event at a time per house.
 */

function seed(over: Record<string, unknown> = {}, insurance: Record<string, unknown> = {}) {
  db.seed('organizations', [{ id: ORG_ID, order_profile: { insurance }, passport: {} }]);
  db.seed('orders', [orderRow({ sandbox: true, rental_start: '2026-12-01', rental_end: '2026-12-05', ...over })]);
  db.seed('order_items', [
    orderItemRow({ id: 'oi-1' }),
    orderItemRow({ id: 'oi-2', item_id: 'hpr-9', source: 'hpr', source_id: '9', vendor: 'Hand Prop Room', price_cents: null }),
  ]);
}

async function open() {
  return openBookings(await getOrderById('order-1', ORG_ID));
}

const step = (vendorId: string, input: Parameters<typeof advanceBooking>[3]) =>
  advanceBooking('order-1', ORG_ID, vendorId, input);

beforeEach(() => {
  db.reset();
  db.relation('orders', 'order_items', 'order_id');
  db.unique('order_bookings', ['order_id', 'vendor_id']);
});

describe('openBookings', () => {
  it('saves the card on the order and opens one booking per house', async () => {
    seed();
    const bookings = await open();
    expect(bookings.map((b) => [b.vendorName, b.stage])).toEqual([
      ['Hand Prop Room', 'inquiry_sent'],
      ['Omega Cinema Props', 'inquiry_sent'],
    ]);
    expect(bookings[0]!.packet.find((p) => p.kind === 'w9')).toMatchObject({ status: 'to_follow' });
    expect(bookings[0]!.history).toEqual([expect.objectContaining({ event: 'open', from: null, to: 'inquiry_sent' })]);
    expect(db.rows('orders')[0].payment_method).toMatchObject({ last4: '4242' });
  });

  it('reads the certificate route off the profile when the inquiry goes out', async () => {
    seed({}, { carrier: 'Hiscox', glLimit: 2_000_000, broker: { name: 'Acme Insurance', email: 'certs@acme.example' } });
    const [hpr] = await open();
    expect(hpr!.insurance).toEqual({ route: 'own', brokerName: 'Acme Insurance', brokerEmail: 'certs@acme.example' });
    expect(hpr!.packet.find((p) => p.kind === 'insurability')!.line).toBe(
      'COI naming Hand Prop Room follows from our broker, Acme Insurance, when you confirm.',
    );
  });

  it('refuses a live order and writes nothing', async () => {
    seed({ sandbox: false });
    await expect(open()).rejects.toThrow('not a sandbox order');
    expect(db.rows('order_bookings')).toHaveLength(0);
    expect(db.rows('orders')[0].payment_method).toBeFalsy();
  });

  it('is safe to call twice', async () => {
    seed();
    await open();
    await open();
    expect(db.rows('order_bookings')).toHaveLength(2);
  });
});

describe('advanceBooking', () => {
  it('walks a house from inquiry to pickup and keeps the order true to it', async () => {
    seed();
    await open();

    expect(await step('omega', { event: 'confirm', amountCents: 27_000 })).toMatchObject({ ok: true });
    expect(db.rows('order_items').find((i) => i.id === 'oi-1')!.status).toBe('confirmed');
    expect(db.rows('orders')[0].status).toBe('processing');

    await step('omega', { event: 'issue_coi' });
    await step('omega', { event: 'place_hold' });
    const done = await step('omega', { event: 'capture' });
    if (!done.ok) throw new Error(done.message);

    const omega = done.bookings.find((b) => b.vendorId === 'omega')!;
    expect(omega.stage).toBe('captured');
    expect(omega.certificate).toMatchObject({
      holderName: 'Omega Cinema Props',
      issuer: 'ATHOS (sandbox)',
      coverageStart: '2026-12-01',
      coverageEnd: '2026-12-05',
    });
    expect(omega.capture).toMatchObject({ amountCents: 27_000, feeCents: 2_700, payoutCents: 24_300 });
    expect(omega.history.map((h) => h.event)).toEqual(['open', 'confirm', 'issue_coi', 'place_hold', 'capture']);

    // What was returned is what was stored.
    const stored = (await listBookings('order-1', ORG_ID)).find((b) => b.vendorId === 'omega')!;
    expect(stored).toMatchObject({ stage: 'captured', amountCents: 27_000 });
  });

  it("own policy: confirming writes the broker's request, and the broker's certificate carries the production's limits", async () => {
    seed({}, { carrier: 'Hiscox', glLimit: 3_000_000, aggregateLimit: 4_000_000, broker: { name: 'Acme Insurance', email: 'certs@acme.example' } });
    await open();
    const confirmed = await step('omega', { event: 'confirm', amountCents: 12_000 });
    if (!confirmed.ok) throw new Error(confirmed.message);
    expect(confirmed.bookings.find((b) => b.vendorId === 'omega')!.coiRequest).toMatchObject({ to: 'certs@acme.example' });

    expect(await step('omega', { event: 'issue_coi' })).toMatchObject({ ok: false, reason: 'invalid_transition' });
    const received = await step('omega', { event: 'receive_coi' });
    if (!received.ok) throw new Error(received.message);
    expect(received.bookings.find((b) => b.vendorId === 'omega')).toMatchObject({
      stage: 'coi_issued',
      certificate: { issuer: 'Acme Insurance', glLimit: 3_000_000, aggregateLimit: 4_000_000, holderName: 'Omega Cinema Props' },
    });
  });

  it('certificate on file: it is attached, and nobody issues anything', async () => {
    seed({}, { coiDocument: { storagePath: 'org/coi.pdf', name: 'Nocturne-COI.pdf', uploadedAt: '2026-10-01T00:00:00Z' } });
    await open();
    await step('omega', { event: 'confirm', amountCents: 12_000 });
    const attached = await step('omega', { event: 'attach_coi' });
    if (!attached.ok) throw new Error(attached.message);
    const omega = attached.bookings.find((b) => b.vendorId === 'omega')!;
    expect(omega.coiRequest).toBeUndefined();
    expect(omega.certificate).toMatchObject({ issuer: 'on file', certificateNumber: 'Nocturne-COI.pdf', issuedAt: '2026-10-01T00:00:00Z' });
  });

  it('a decline marks that house unavailable; the order settles once every house has answered', async () => {
    seed();
    await open();
    await step('hpr', { event: 'decline', note: 'Out on another show.' });
    expect(db.rows('order_items').find((i) => i.id === 'oi-2')).toMatchObject({
      status: 'unavailable',
      status_note: 'Out on another show.',
    });
    expect(db.rows('order_items').find((i) => i.id === 'oi-1')!.status).toBe('pending');
    expect(db.rows('orders')[0].status).toBe('processing');

    await step('omega', { event: 'confirm', amountCents: 12_000 });
    expect(db.rows('orders')[0].status).toBe('confirmed');
  });

  it('a lapsed hold clears and can be placed again', async () => {
    seed();
    await open();
    await step('omega', { event: 'confirm', amountCents: 12_000 });
    await step('omega', { event: 'issue_coi' });
    await step('omega', { event: 'place_hold' });
    const lapsed = await step('omega', { event: 'expire_hold' });
    if (!lapsed.ok) throw new Error(lapsed.message);
    const omega = lapsed.bookings.find((b) => b.vendorId === 'omega')!;
    expect(omega.stage).toBe('coi_issued');
    expect(omega.hold).toBeUndefined();
    expect(await step('omega', { event: 'capture' })).toMatchObject({ ok: false, reason: 'invalid_transition' });
    expect(await step('omega', { event: 'place_hold' })).toMatchObject({ ok: true });
  });

  it('charges extras only after pickup, and only with a kind and an amount', async () => {
    seed();
    await open();
    expect(await step('omega', { event: 'charge_extra', kind: 'damage', amountCents: 5_000 })).toMatchObject({
      ok: false,
      reason: 'invalid_transition',
    });
    await step('omega', { event: 'confirm', amountCents: 12_000 });
    await step('omega', { event: 'issue_coi' });
    await step('omega', { event: 'place_hold' });
    await step('omega', { event: 'capture' });

    expect(await step('omega', { event: 'charge_extra', amountCents: 5_000 })).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(await step('omega', { event: 'charge_extra', kind: 'damage', amountCents: 0 })).toMatchObject({ ok: false, reason: 'invalid_input' });
    const charged = await step('omega', { event: 'charge_extra', kind: 'damage', amountCents: 5_000, note: 'Chipped veneer' });
    if (!charged.ok) throw new Error(charged.message);
    expect(charged.bookings.find((b) => b.vendorId === 'omega')!.extras).toEqual([
      expect.objectContaining({ kind: 'damage', amountCents: 5_000, note: 'Chipped veneer' }),
    ]);
  });

  it('refuses what it should: unknown event, bad total, a live order, another org, a missing house', async () => {
    seed();
    await open();
    expect(await step('omega', { event: 'teleport' as never })).toMatchObject({ ok: false, reason: 'invalid_event' });
    expect(await step('omega', { event: 'confirm' })).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(await step('omega', { event: 'confirm', amountCents: 12.5 })).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(await step('ec', { event: 'confirm', amountCents: 1_000 })).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await advanceBooking('order-1', OTHER_ORG_ID, 'omega', { event: 'confirm', amountCents: 1_000 })).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    expect(db.rows('order_bookings').every((b) => b.stage === 'inquiry_sent')).toBe(true);

    db.rows('orders')[0].sandbox = false;
    expect(await step('omega', { event: 'confirm', amountCents: 1_000 })).toMatchObject({ ok: false, reason: 'not_sandbox' });
  });

  it('two charges added at once do not overwrite each other: one lands, one is told to reload', async () => {
    seed();
    await open();
    await step('omega', { event: 'confirm', amountCents: 12_000 });
    await step('omega', { event: 'issue_coi' });
    await step('omega', { event: 'place_hold' });
    await step('omega', { event: 'capture' });
    const results = await Promise.all([
      step('omega', { event: 'charge_extra', kind: 'damage', amountCents: 5_000 }),
      step('omega', { event: 'charge_extra', kind: 'late_fee', amountCents: 2_000 }),
    ]);
    expect(results.map((r) => (r.ok ? 'ok' : r.reason)).sort()).toEqual(['ok', 'stale']);
    const [omega] = (await listBookings('order-1', ORG_ID)).filter((b) => b.vendorId === 'omega');
    expect(omega!.extras).toHaveLength(1);
  });

  it('two clicks that read the same stage advance the house once', async () => {
    seed();
    await open();
    const results = await Promise.all([
      step('omega', { event: 'confirm', amountCents: 1_000 }),
      step('omega', { event: 'confirm', amountCents: 2_000 }),
    ]);
    expect(results.map((r) => (r.ok ? 'ok' : r.reason)).sort()).toEqual(['ok', 'stale']);
    const [omega] = db.rows('order_bookings').filter((b) => b.vendor_id === 'omega');
    expect((omega.state as { history: unknown[] }).history).toHaveLength(2);
  });
});
