import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { makeCartLine, READY_PROFILE } from '@/test/fixtures/orders';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('next/server', async () => (await import('@/test/mocks/next-server')).nextServerModule());
vi.mock('@/lib/spacelab/handoff', () => ({ queueSpacelabHandoff: vi.fn(async () => undefined) }));
vi.mock('@/lib/forms/packet', () => ({ buildOrderPaperwork: vi.fn(async () => []) }));

import { ORG_ID, OTHER_ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { afterCalls, flushAfter, resetAfter } from '@/test/mocks/next-server';
import { queueSpacelabHandoff } from '@/lib/spacelab/handoff';
import { buildOrderPaperwork } from '@/lib/forms/packet';
import { LogMailer } from '@/lib/mail/provider';
import { retryOutboundMessage } from '@/lib/outreach/send';
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

  it('saves the production fields the cart sent to the profile before judging readiness', async () => {
    seedOrg({ ...READY_PROFILE, company: {}, contacts: {}, authorization: { formsOnBehalf: false } });
    const res = await POST(
      jsonRequest('/api/checkout', {
        ...body,
        production: { legalName: ' Acme Pictures ', contactName: 'Sam', contactEmail: 'sam@acme.example', formsOnBehalf: true },
      }),
    );
    expect(res.status).toBe(201);
    const [org] = db.rows('organizations');
    expect(org.order_profile).toMatchObject({
      company: { legalName: 'Acme Pictures' },
      contacts: { ordering: { name: 'Sam', email: 'sam@acme.example' } },
      authorization: { formsOnBehalf: true, acceptedByUserId: USER_ID },
    });
    expect((org.order_profile as { authorization: { acceptedAt: string } }).authorization.acceptedAt).toMatch(/^\d{4}-/);
    expect(db.rows('orders')).toHaveLength(1);
  });

  it('422 with what is still missing after a partial production patch, and keeps what it saved', async () => {
    seedOrg({ ...READY_PROFILE, company: {}, authorization: { formsOnBehalf: false } });
    const res = await POST(jsonRequest('/api/checkout', { ...body, production: { legalName: 'Acme' } }));
    expect(res.status).toBe(422);
    expect(await readJson(res)).toEqual({ error: 'order profile is incomplete', missing: ['Authorization to complete forms'] });
    expect(db.rows('organizations')[0].order_profile).toMatchObject({ company: { legalName: 'Acme' } });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('does not touch the profile when the body sends no production fields', async () => {
    seedOrg();
    await POST(jsonRequest('/api/checkout', { ...body, production: { formsOnBehalf: false } }));
    expect(db.log.filter((l) => l.table === 'organizations' && l.op === 'update')).toHaveLength(0);
  });

  it('422 when the org has no profile row at all', async () => {
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(422);
  });

  it('400 for a malformed JSON body, and places nothing', async () => {
    seedOrg();
    const res = await POST(rawRequest('/api/checkout', '{not json'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid JSON' });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it.each([
    ['a non-string key', 42],
    ['an over-long key', 'k'.repeat(201)],
  ])('400 for %s', async (_label, idempotencyKey) => {
    seedOrg();
    const res = await POST(jsonRequest('/api/checkout', { lines: body.lines, idempotencyKey }));
    expect(res.status).toBe(400);
    expect(db.rows('orders')).toHaveLength(0);
  });

  it.each([
    ['a javascript: link', { sourceUrl: 'javascript:alert(1)' }],
    ['a relative link', { sourceUrl: '/item/1' }],
    ['a missing name', { name: '' }],
    ['a non-numeric price', { priceCents: '120' }],
    ['a negative price', { priceCents: -1 }],
    ['a source that is not a slug', { source: 'Omega <b>' }],
  ])('400 for a line with %s, and places nothing', async (_label, over) => {
    seedOrg();
    const res = await POST(jsonRequest('/api/checkout', { ...body, lines: [{ ...makeCartLine(), ...over }] }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'a cart line is invalid' });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('400 for more lines than one checkout takes', async () => {
    seedOrg();
    const lines = Array.from({ length: 201 }, (_, i) => makeCartLine({ itemId: `omega-${i}` }));
    const res = await POST(jsonRequest('/api/checkout', { ...body, lines }));
    expect(res.status).toBe(400);
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('drops an unusable photo rather than refusing the line', async () => {
    seedOrg();
    const res = await POST(
      jsonRequest('/api/checkout', { ...body, lines: [{ ...makeCartLine(), image: 'javascript:alert(1)' }] }),
    );
    expect(res.status).toBe(201);
    expect(db.rows('order_items')[0].image).toBeNull();
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
      // Pickup is assumed: the profile's default delivery address is never applied to an order.
      delivery_address: null,
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

  it('takes the request form: dates, location, notes and shoot details, over the profile defaults', async () => {
    seedOrg();
    await POST(
      jsonRequest('/api/checkout', {
        ...body,
        rentalStart: '2026-10-01',
        rentalEnd: '2026-10-03',
        deliveryAddress: { line1: '1 Stage Rd', city: 'LA', state: 'CA', zip: '90028', junk: 'x' },
        deliveryNotes: '  gate code 4321  ',
        shootDetails: '  Two-day commercial, living room set  ',
      }),
    );
    expect(db.rows('orders')[0]).toMatchObject({
      rental_start: '2026-10-01',
      rental_end: '2026-10-03',
      delivery_address: { line1: '1 Stage Rd', city: 'LA', state: 'CA', zip: '90028' },
      delivery_notes: 'gate code 4321',
      shoot_details: 'Two-day commercial, living room set',
    });
  });

  it('stores no shoot details when the form sent none or something that is not text', async () => {
    seedOrg();
    await POST(jsonRequest('/api/checkout', { ...body, shootDetails: { nope: true } }));
    expect(db.rows('orders')[0]).toMatchObject({ shoot_details: null });
  });

  it('422 with the request gaps when neither the form nor the profile gives dates', async () => {
    seedOrg({ ...READY_PROFILE, defaults: {} });
    const res = await POST(jsonRequest('/api/checkout', body));
    expect(res.status).toBe(422);
    expect(await readJson(res)).toEqual({ error: 'request is incomplete', missing: ['Rental dates'] });
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('422 when the form gives an end date before the start', async () => {
    seedOrg();
    const res = await POST(jsonRequest('/api/checkout', { ...body, rentalStart: '2026-10-03', rentalEnd: '2026-10-01' }));
    expect(res.status).toBe(422);
    expect(await readJson(res)).toEqual({ error: 'request is incomplete', missing: ['Rental dates'] });
  });

  it('stores no address when the body address is unusable, never the profile default', async () => {
    seedOrg();
    await POST(jsonRequest('/api/checkout', { ...body, deliveryAddress: 'not an address', deliveryNotes: '   ' }));
    expect(db.rows('orders')[0]).toMatchObject({ delivery_address: null, delivery_notes: null });
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
        payload: { orderId: db.rows('orders')[0].id, itemCount: 3, vendorCount: 2, sandbox: false },
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

  describe('projectId', () => {
    function seedProject(id: string, orgId = ORG_ID) {
      db.relation('projects', 'project_folders', 'project_id');
      db.relation('project_folders', 'project_items', 'folder_id');
      db.relation('project_folders', 'project_documents', 'folder_id');
      db.seed('projects', [{ id, org_id: orgId, name: 'Nocturne', profile: {}, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', archived_at: null }]);
    }

    it('places the order on one of the session org’s projects', async () => {
      seedOrg();
      seedProject('p-1');
      const res = await POST(jsonRequest('/api/checkout', { ...body, projectId: 'p-1' }));
      expect(res.status).toBe(201);
      expect(db.rows('orders')).toEqual([expect.objectContaining({ project_id: 'p-1' })]);
    });

    it('leaves project_id null when the cart sends none or an empty one', async () => {
      seedOrg();
      await POST(jsonRequest('/api/checkout', body));
      await POST(jsonRequest('/api/checkout', { ...body, idempotencyKey: 'click-2', projectId: '' }));
      expect(db.rows('orders').map((o) => o.project_id)).toEqual([null, null]);
    });

    it('404s for another org’s project and places nothing', async () => {
      seedOrg();
      seedProject('p-theirs', OTHER_ORG_ID);
      const res = await POST(jsonRequest('/api/checkout', { ...body, projectId: 'p-theirs' }));
      expect(res.status).toBe(404);
      expect(await readJson(res)).toEqual({ error: 'project not found' });
      expect(db.rows('orders')).toEqual([]);
      expect(db.rows('events')).toEqual([]);
    });

    it('400s for a non-string projectId', async () => {
      seedOrg();
      const res = await POST(jsonRequest('/api/checkout', { ...body, projectId: 12 }));
      expect(res.status).toBe(400);
      expect(db.rows('orders')).toEqual([]);
    });
  });

  it('surfaces a non-duplicate insert failure instead of swallowing it', async () => {
    seedOrg();
    db.failNext('orders', 'insert', { code: '57014', message: 'statement timeout' });
    await expect(POST(jsonRequest('/api/checkout', body))).rejects.toMatchObject({ message: 'statement timeout' });
  });

  it('removes the order when its lines fail to insert, so a retry with the same key places it whole', async () => {
    seedOrg();
    db.failNext('order_items', 'insert', { code: '57014', message: 'statement timeout' });
    await expect(POST(jsonRequest('/api/checkout', body))).rejects.toMatchObject({ message: 'statement timeout' });
    expect(db.rows('orders')).toHaveLength(0);

    const retry = await POST(jsonRequest('/api/checkout', body));
    expect(retry.status).toBe(201);
    expect(db.rows('orders')).toHaveLength(1);
    expect(db.rows('order_items')).toHaveLength(1);
  });
});

describe('sandbox', () => {
  const twoHouses = {
    lines: [
      makeCartLine(),
      makeCartLine({ itemId: 'hpr-9', source: 'hpr', sourceId: '9', vendor: 'Hand Prop Room', priceCents: undefined }),
    ],
    rentalStart: '2026-12-01',
    rentalEnd: '2026-12-05',
    idempotencyKey: 'sandbox-1',
  };

  beforeEach(() => {
    signIn({ isAdmin: true, sandbox: true });
    seedOrg();
    vi.mocked(buildOrderPaperwork).mockClear();
  });

  it('places a sandbox order: card saved, one booking per house, nothing charged or held', async () => {
    const res = await POST(jsonRequest('/api/checkout', twoHouses));
    expect(res.status).toBe(201);

    const [order] = db.rows('orders');
    expect(order.sandbox).toBe(true);
    expect(order.payment_method).toMatchObject({ brand: 'Visa', last4: '4242', id: expect.stringMatching(/^sbx_pm_/) });

    const bookings = db.rows('order_bookings');
    expect(bookings.map((b) => [b.vendor_id, b.stage]).sort()).toEqual([
      ['hpr', 'inquiry_sent'],
      ['omega', 'inquiry_sent'],
    ]);
    for (const b of bookings) {
      const state = b.state as { packet: { kind: string }[]; hold?: unknown; capture?: unknown };
      expect(state.packet.map((p) => p.kind)).toEqual(['info_sheet', 'w9', 'payment_on_file', 'insurability']);
      expect(state.hold).toBeUndefined();
      expect(state.capture).toBeUndefined();
    }
  });

  it('writes every inquiry before answering and hands none to the mailer', async () => {
    const send = vi.spyOn(LogMailer.prototype, 'send');
    send.mockClear();
    await POST(jsonRequest('/api/checkout', twoHouses));

    // Written inline, not in an after() hook: the order page is complete on arrival.
    const messages = db.rows('outbound_messages');
    expect(messages.map((m) => m.status)).toEqual(['sandbox', 'sandbox']);
    expect(messages.every((m) => m.sent_at === undefined && m.provider_message_id === undefined)).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(buildOrderPaperwork).toHaveBeenCalledTimes(1);

    const omega = messages.find((m) => m.vendor_id === 'omega')!;
    expect(omega.body_text).toContain('Payment method on file. Nothing is charged until pickup.');
    expect(omega.body_text).toContain('A certificate naming Omega Cinema Props is issued when you confirm.');
    expect(omega.body_text).not.toContain('COI to follow');
  });

  it('a replayed click opens nothing twice', async () => {
    await POST(jsonRequest('/api/checkout', twoHouses));
    await POST(jsonRequest('/api/checkout', twoHouses));
    expect(db.rows('orders')).toHaveLength(1);
    expect(db.rows('order_bookings')).toHaveLength(2);
    expect(db.rows('outbound_messages')).toHaveLength(2);
  });

  it('a sandbox inquiry cannot be sent later through retry', async () => {
    const send = vi.spyOn(LogMailer.prototype, 'send');
    await POST(jsonRequest('/api/checkout', twoHouses));
    send.mockClear();
    const [message] = db.rows('outbound_messages');
    expect(await retryOutboundMessage(String(message.id), ORG_ID)).toEqual({ ok: false, reason: 'not_failed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('a click that died after opening the bookings finishes on replay', async () => {
    await POST(jsonRequest('/api/checkout', twoHouses));
    db.rows('outbound_messages').length = 0;
    await POST(jsonRequest('/api/checkout', twoHouses));
    expect(db.rows('order_bookings')).toHaveLength(2);
    expect(db.rows('outbound_messages').map((m) => m.status)).toEqual(['sandbox', 'sandbox']);
  });

  it('never calls a real forms provider: paperwork is skipped unless the filler is the mock', async () => {
    vi.stubEnv('FORMS_PROVIDER', 'anvil');
    await POST(jsonRequest('/api/checkout', twoHouses));
    vi.unstubAllEnvs();
    expect(buildOrderPaperwork).not.toHaveBeenCalled();
    expect(db.rows('outbound_messages')).toHaveLength(2);
  });

  it('409 when the cart showed sandbox but the switch is off, and nothing is written or sent', async () => {
    signIn({ isAdmin: true, sandbox: false });
    const send = vi.spyOn(LogMailer.prototype, 'send');
    send.mockClear();
    const res = await POST(jsonRequest('/api/checkout', { ...twoHouses, sandbox: true }));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toMatchObject({ reason: 'mode_changed' });
    await flushAfter();
    expect(db.rows('orders')).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('409 the other way too: the cart showed a live order but the switch is on', async () => {
    const res = await POST(jsonRequest('/api/checkout', { ...twoHouses, sandbox: false }));
    expect(res.status).toBe(409);
    expect(db.rows('orders')).toHaveLength(0);
  });

  it('409 when a key that placed a live order is replayed with the switch on, and nothing is sent again', async () => {
    signIn();
    await POST(jsonRequest('/api/checkout', { ...twoHouses, idempotencyKey: 'live-then-sandbox' }));
    await flushAfter();
    const send = vi.spyOn(LogMailer.prototype, 'send');
    send.mockClear();

    signIn({ isAdmin: true, sandbox: true });
    const res = await POST(jsonRequest('/api/checkout', { ...twoHouses, idempotencyKey: 'live-then-sandbox' }));
    expect(res.status).toBe(409);
    await flushAfter();
    expect(send).not.toHaveBeenCalled();
    expect(db.rows('order_bookings')).toHaveLength(0);
    expect(db.rows('outbound_messages')).toHaveLength(2);
  });

  it('an order placed with the switch off has no bookings and is not a sandbox order', async () => {
    signIn();
    await POST(jsonRequest('/api/checkout', { ...twoHouses, idempotencyKey: 'live-1' }));
    await flushAfter();
    expect(db.rows('orders')[0]).not.toHaveProperty('sandbox');
    expect(db.rows('order_bookings')).toHaveLength(0);
    expect(db.rows('outbound_messages').map((m) => m.status)).toEqual(['sent', 'sent']);
  });
});
