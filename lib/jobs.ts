/**
 * The jobs aggregation seam (MVP-8).
 *
 * A "job" in Phase 1 IS an order, read alongside the org's crew requests.
 * There is no `jobs` table — this module is the single place that joins the
 * org-scoped, status-carrying tables (orders/order_items, crew_requests) into
 * the shape the /jobs dashboard and the /orders/[id] job detail render. When a
 * real `jobs` grouping entity arrives (FUT-4), it slots in here without UI
 * rework.
 *
 * Server-only: uses the service-role client like the rest of the order reads.
 */

import { createAdminClient } from './supabase/admin';
import { getOrderById, listOrders, summarizeOrder, type Order, type VendorSummary } from './orders';

export type CrewRequestRow = {
  id: string;
  contractorId: string;
  contractorName: string;
  contractorPhoto: string | null;
  requestedDates: string[];
  location: string | null;
  notes: string | null;
  status: 'requested' | 'confirmed' | 'declined';
  createdAt: string;
  updatedAt: string;
};

/** An order enriched into a job: its per-vendor rollup. */
export type Job = Order & {
  vendorSummaries: VendorSummary[];
};

export type JobsStats = {
  ordersInFlight: number;
  itemsPending: number;
  itemsQuoted: number;
  itemsConfirmed: number;
  crewPending: number;
  /** Distinct vendors across in-flight orders. */
  vendorsNotified: number;
  // MVP-11 fills this from outbound_messages.
  messagesSent: number;
  // MVP-12 fills this from order_documents (awaiting_signature + manual).
  documentsPending: number;
};

export type JobsOverview = {
  jobs: Job[];
  crew: CrewRequestRow[];
  stats: JobsStats;
};

type CrewRow = {
  id: string;
  contractor_id: string;
  requested_dates: string[] | null;
  location: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  contractors: { name: string; photo: string | null } | { name: string; photo: string | null }[] | null;
};

function toCrew(r: CrewRow): CrewRequestRow {
  // PostgREST embeds a to-one as an object, but the loose type allows an array;
  // normalize to a single contractor.
  const contractor = Array.isArray(r.contractors) ? r.contractors[0] : r.contractors;
  return {
    id: r.id,
    contractorId: r.contractor_id,
    contractorName: contractor?.name ?? 'Contractor',
    contractorPhoto: contractor?.photo ?? null,
    requestedDates: r.requested_dates ?? [],
    location: r.location,
    notes: r.notes,
    status: r.status as CrewRequestRow['status'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * True while an order still has work in flight. Cancelled orders drop off the
 * board; everything else (including recently confirmed) stays visible so a user
 * sees the whole pipeline, not just the unfinished part.
 */
function isInFlight(order: Order): boolean {
  return order.status !== 'cancelled';
}

async function fetchCrewRequests(orgId: string): Promise<CrewRequestRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('crew_requests')
    .select(
      'id, contractor_id, requested_dates, location, notes, status, created_at, updated_at, contractors(name, photo)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  return ((data ?? []) as CrewRow[]).map(toCrew);
}

/** Everything a signed-in user has in flight, for the /jobs dashboard. */
export async function getJobsOverview(orgId: string): Promise<JobsOverview> {
  const [orders, crew] = await Promise.all([listOrders(orgId), fetchCrewRequests(orgId)]);

  const jobs: Job[] = orders.filter(isInFlight).map((order) => ({
    ...order,
    vendorSummaries: summarizeOrder(order),
  }));

  const vendors = new Set<string>();
  const stats: JobsStats = {
    ordersInFlight: jobs.filter((j) => j.status !== 'confirmed').length,
    itemsPending: 0,
    itemsQuoted: 0,
    itemsConfirmed: 0,
    crewPending: crew.filter((c) => c.status === 'requested').length,
    vendorsNotified: 0,
    messagesSent: 0,
    documentsPending: 0,
  };

  for (const job of jobs) {
    for (const item of job.items) {
      if (item.status === 'pending') stats.itemsPending += 1;
      else if (item.status === 'quoted') stats.itemsQuoted += 1;
      else if (item.status === 'confirmed') stats.itemsConfirmed += 1;
    }
    for (const v of job.vendorSummaries) vendors.add(v.vendor);
  }
  stats.vendorsNotified = vendors.size;

  return { jobs, crew, stats };
}

export type JobDetail = {
  order: Order;
  vendorSummaries: VendorSummary[];
};

/** One order enriched into its job detail view (/orders/[id]). */
export async function getJobDetail(orderId: string, orgId: string): Promise<JobDetail | null> {
  let order: Order;
  try {
    order = await getOrderById(orderId, orgId);
  } catch {
    return null;
  }

  return {
    order,
    vendorSummaries: summarizeOrder(order),
  };
}

/**
 * The §9.7 row copy for an order, in set-life voice (no exclamation, no
 * em-dash). Single vendor: "Newel confirmed 4 of 6 items. 2 pending." Multiple:
 * a vendor count plus the same confirmed/pending rollup.
 */
export function jobRollupCopy(job: Job): string {
  const totals = job.vendorSummaries.reduce(
    (acc, v) => ({
      total: acc.total + v.total,
      confirmed: acc.confirmed + v.confirmed,
      pending: acc.pending + v.pending + v.quoted,
      unavailable: acc.unavailable + v.unavailable,
    }),
    { total: 0, confirmed: 0, pending: 0, unavailable: 0 },
  );

  if (totals.total === 0) return 'No items on this order.';

  const tail: string[] = [];
  if (totals.pending > 0) tail.push(`${totals.pending} pending`);
  if (totals.unavailable > 0) tail.push(`${totals.unavailable} unavailable`);
  const tailCopy = tail.length ? ` ${tail.join(', ')}.` : '';

  if (job.vendorSummaries.length === 1) {
    const v = job.vendorSummaries[0]!;
    return `${v.vendor} confirmed ${v.confirmed} of ${v.total} items.${tailCopy}`;
  }

  return `${job.vendorSummaries.length} vendors, ${totals.confirmed} of ${totals.total} items confirmed.${tailCopy}`;
}
