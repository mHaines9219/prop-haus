import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeOrder, makeOrderItem, orderItemRow, orderRow } from '@/test/fixtures/orders';

/**
 * The /jobs board is a join of orders, crew requests, sent outreach and
 * pending paperwork with derived stats. The counts and the row copy are what
 * a coordinator reads at a glance, so each bucket is pinned against seeded rows.
 */

vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { summarizeOrder } from './orders';
import { getJobDetail, getJobsOverview, jobRollupCopy, type Job } from './jobs';

beforeEach(() => {
  db.reset();
  db.relation('orders', 'order_items', 'order_id');
  db.relation('contractors', 'crew_requests', 'contractor_id');
});

function crewRow(over: Record<string, unknown> = {}) {
  return {
    org_id: ORG_ID,
    contractor_id: 'c-1',
    requested_dates: ['2026-09-10'],
    location: 'Stage 4',
    notes: null,
    status: 'requested',
    created_at: '2026-09-02T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    ...over,
  };
}

const ZERO_STATS = {
  ordersInFlight: 0,
  itemsPending: 0,
  itemsQuoted: 0,
  itemsConfirmed: 0,
  crewPending: 0,
  vendorsNotified: 0,
  messagesSent: 0,
  documentsPending: 0,
};

describe('getJobsOverview', () => {
  it('is empty with zeroed stats for a new org', async () => {
    await expect(getJobsOverview(ORG_ID)).resolves.toEqual({ jobs: [], crew: [], stats: ZERO_STATS });
  });

  it('drops cancelled orders, keeps confirmed ones off the in-flight count, and rolls up items and vendors', async () => {
    db.seed('orders', [
      orderRow({ id: 'placed', idempotency_key: 'a', created_at: '2026-09-01T00:00:00Z' }),
      orderRow({ id: 'done', idempotency_key: 'b', status: 'confirmed', created_at: '2026-09-02T00:00:00Z' }),
      orderRow({ id: 'gone', idempotency_key: 'c', status: 'cancelled', created_at: '2026-09-03T00:00:00Z' }),
      orderRow({ id: 'theirs', idempotency_key: 'd', org_id: OTHER_ORG_ID, created_at: '2026-09-04T00:00:00Z' }),
    ]);
    db.seed('order_items', [
      orderItemRow({ id: '1', order_id: 'placed', vendor: 'Newel', status: 'pending' }),
      orderItemRow({ id: '2', order_id: 'placed', vendor: 'Newel', status: 'quoted' }),
      orderItemRow({ id: '3', order_id: 'placed', vendor: 'Omega', status: 'unavailable' }),
      orderItemRow({ id: '4', order_id: 'done', vendor: 'Omega', status: 'confirmed' }),
      orderItemRow({ id: '5', order_id: 'done', vendor: 'Alley Cats', status: 'confirmed' }),
      orderItemRow({ id: '6', order_id: 'gone', vendor: 'Ghost', status: 'pending' }),
      orderItemRow({ id: '7', order_id: 'theirs', vendor: 'Other', status: 'pending' }),
    ]);

    const { jobs, stats } = await getJobsOverview(ORG_ID);
    expect(jobs.map((j) => j.id)).toEqual(['done', 'placed']);
    expect(jobs[1].vendorSummaries).toEqual(summarizeOrder(jobs[1]));
    expect(jobs.map((j) => j.messagesSent)).toEqual([0, 0]);
    expect(stats).toEqual({ ...ZERO_STATS, ordersInFlight: 1, itemsPending: 1, itemsQuoted: 1, itemsConfirmed: 2, vendorsNotified: 3 });
  });

  it('counts sent outreach per job and pending paperwork across the org', async () => {
    db.seed('orders', [
      orderRow({ id: 'o1', idempotency_key: 'a', created_at: '2026-09-01T00:00:00Z' }),
      orderRow({ id: 'o2', idempotency_key: 'b', created_at: '2026-09-02T00:00:00Z' }),
      orderRow({ id: 'gone', idempotency_key: 'c', status: 'cancelled', created_at: '2026-09-03T00:00:00Z' }),
    ]);
    db.seed('outbound_messages', [
      { org_id: ORG_ID, order_id: 'o1', status: 'sent' },
      { org_id: ORG_ID, order_id: 'o1', status: 'sent' },
      { org_id: ORG_ID, order_id: 'o1', status: 'failed' },
      { org_id: ORG_ID, order_id: 'o2', status: 'sent' },
      { org_id: ORG_ID, order_id: 'gone', status: 'sent' },
      { org_id: OTHER_ORG_ID, order_id: 'o1', status: 'sent' },
    ]);
    db.seed('order_documents', [
      { org_id: ORG_ID, status: 'awaiting_signature' },
      { org_id: ORG_ID, status: 'manual' },
      { org_id: ORG_ID, status: 'signed' },
      { org_id: OTHER_ORG_ID, status: 'manual' },
    ]);

    const { jobs, stats } = await getJobsOverview(ORG_ID);
    expect(jobs.map((j) => [j.id, j.messagesSent])).toEqual([
      ['o2', 1],
      ['o1', 2],
    ]);
    expect(stats.messagesSent).toBe(3);
    expect(stats.documentsPending).toBe(2);
  });

  it('lists the org’s crew requests newest first with the contractor embedded', async () => {
    db.seed('contractors', [{ id: 'c-1', name: 'Dana Ortiz', photo: 'https://img/dana.jpg' }]);
    db.seed('crew_requests', [
      crewRow({ id: 'r-old', created_at: '2026-09-01T00:00:00Z', status: 'confirmed' }),
      crewRow({ id: 'r-new', created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z', notes: 'bring gloves' }),
      crewRow({ id: 'r-theirs', org_id: OTHER_ORG_ID, created_at: '2026-09-05T00:00:00Z' }),
    ]);
    const { crew, stats } = await getJobsOverview(ORG_ID);
    expect(crew.map((c) => c.id)).toEqual(['r-new', 'r-old']);
    expect(crew[0]).toEqual({
      id: 'r-new',
      contractorId: 'c-1',
      contractorName: 'Dana Ortiz',
      contractorPhoto: 'https://img/dana.jpg',
      requestedDates: ['2026-09-10'],
      location: 'Stage 4',
      notes: 'bring gloves',
      status: 'requested',
      createdAt: '2026-09-03T00:00:00Z',
      updatedAt: '2026-09-03T00:00:00Z',
    });
    expect(stats.crewPending).toBe(1);
  });

  it('fills in a placeholder when the contractor row is gone and dates are null', async () => {
    db.seed('crew_requests', [crewRow({ id: 'r', contractor_id: 'missing', requested_dates: null })]);
    const { crew } = await getJobsOverview(ORG_ID);
    expect(crew[0]).toMatchObject({ contractorName: 'Contractor', contractorPhoto: null, requestedDates: [] });
  });

  it('treats failed crew, outreach and paperwork reads as zero rather than failing the board', async () => {
    db.seed('orders', [orderRow()]);
    db.failNext('crew_requests', 'select', 'boom');
    db.failNext('outbound_messages', 'select', 'boom');
    db.failNext('order_documents', 'select', 'boom');
    const overview = await getJobsOverview(ORG_ID);
    expect(overview.crew).toEqual([]);
    expect(overview.jobs[0].messagesSent).toBe(0);
    expect(overview.stats).toMatchObject({ messagesSent: 0, documentsPending: 0 });
  });

  it('rejects when the orders read fails', async () => {
    db.failNext('orders', 'select', 'boom');
    await expect(getJobsOverview(ORG_ID)).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('getJobDetail', () => {
  beforeEach(() => {
    db.seed('orders', [orderRow()]);
    db.seed('order_items', [orderItemRow()]);
  });

  it('returns the order with its vendor rollup', async () => {
    const detail = await getJobDetail('order-1', ORG_ID);
    expect(detail?.order).toEqual(makeOrder());
    expect(detail?.vendorSummaries).toEqual([
      { vendor: 'Omega Cinema Props', total: 1, pending: 1, quoted: 0, confirmed: 0, unavailable: 0 },
    ]);
  });

  it('is null for another org or an unknown id', async () => {
    await expect(getJobDetail('order-1', OTHER_ORG_ID)).resolves.toBeNull();
    await expect(getJobDetail('nope', ORG_ID)).resolves.toBeNull();
  });
});

describe('jobRollupCopy', () => {
  function job(items: Parameters<typeof makeOrderItem>[0][], messagesSent = 0): Job {
    const order = makeOrder({ items: items.map((i, n) => makeOrderItem({ id: String(n), ...i })) });
    return { ...order, vendorSummaries: summarizeOrder(order), messagesSent };
  }

  it('says so when there is nothing on the order', () => {
    expect(jobRollupCopy(job([]))).toBe('No items on this order.');
  });

  it('reads as one vendor’s confirmed count with no tail when everything is settled', () => {
    expect(jobRollupCopy(job([{ vendor: 'Newel', status: 'confirmed' }, { vendor: 'Newel', status: 'confirmed' }]))).toBe(
      'Newel confirmed 2 of 2 items.',
    );
  });

  it('counts quoted lines as pending in the tail', () => {
    expect(
      jobRollupCopy(
        job([
          { vendor: 'Newel', status: 'confirmed' },
          { vendor: 'Newel', status: 'pending' },
          { vendor: 'Newel', status: 'quoted' },
        ]),
      ),
    ).toBe('Newel confirmed 1 of 3 items. 2 pending.');
  });

  it('adds unavailable after pending', () => {
    expect(
      jobRollupCopy(job([{ vendor: 'Newel', status: 'pending' }, { vendor: 'Newel', status: 'unavailable' }])),
    ).toBe('Newel confirmed 0 of 2 items. 1 pending, 1 unavailable.');
    expect(jobRollupCopy(job([{ vendor: 'Newel', status: 'unavailable' }]))).toBe(
      'Newel confirmed 0 of 1 items. 1 unavailable.',
    );
  });

  it('switches to a vendor count with several vendors', () => {
    expect(
      jobRollupCopy(
        job([
          { vendor: 'Newel', status: 'confirmed' },
          { vendor: 'Omega', status: 'pending' },
          { vendor: 'Alley Cats', status: 'confirmed' },
        ]),
      ),
    ).toBe('3 vendors, 2 of 3 items confirmed. 1 pending.');
  });

  it('leads with the requests that went out, singular and plural, and drops the vendor count after it', () => {
    expect(jobRollupCopy(job([{ vendor: 'Newel', status: 'pending' }], 1))).toBe(
      'Sent to 1 vendor. Newel confirmed 0 of 1 items. 1 pending.',
    );
    expect(
      jobRollupCopy(
        job(
          [
            { vendor: 'Newel', status: 'confirmed' },
            { vendor: 'Omega', status: 'pending' },
          ],
          2,
        ),
      ),
    ).toBe('Sent to 2 vendors. 1 of 2 items confirmed. 1 pending.');
    expect(jobRollupCopy(job([], 3))).toBe('Sent to 3 vendors. No items on this order.');
  });
});
