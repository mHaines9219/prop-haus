/**
 * The jobs aggregation seam (MVP-8, moved under projects Sep 2026).
 *
 * A "job" in Phase 1 IS an order, read alongside the org's crew requests.
 * There is no `jobs` table — this module is the single place that joins the
 * org-scoped, status-carrying tables (orders/order_items, crew_requests) into
 * the shape the project page's JOBS and CREW sections and the /orders/[id]
 * job detail render. Orders and crew requests carry a nullable `project_id`
 * (20260921130000_project_jobs_and_crew.sql); getProjectJobs reads one
 * project's slice, getJobsOverview the whole org (the /account activity tiles).
 * When a real `jobs` grouping entity arrives (FUT-4), it slots in here without
 * UI rework.
 *
 * Server-only: uses the service-role client like the rest of the order reads.
 */

import { createAdminClient } from './supabase/admin';
import { getOrderById, listOrders, summarizeOrder, type Order, type VendorSummary } from './orders';
import { countPendingDocuments } from './forms/documents';
import { sentCountsByOrder } from './outreach/send';

export type CrewRequestStatus = 'requested' | 'confirmed' | 'declined';

/**
 * One crew request with the contractor embedded in full, so the project page
 * can expand a row into the contractor's profile (photo, skills, rate, bio)
 * without a second read.
 */
export type CrewRequestRow = {
  id: string;
  /** The production the request was made for; null when requested without one. */
  projectId: string | null;
  contractorId: string;
  contractorName: string;
  contractorPhoto: string | null;
  /** contractors.skills tags (lib/crew CREW_SKILL_LABELS). */
  contractorSkills: string[];
  contractorCity: string | null;
  /** Day rate range in cents; null = rate on request. */
  contractorRateLow: number | null;
  contractorRateHigh: number | null;
  contractorBio: string | null;
  requestedDates: string[];
  location: string | null;
  notes: string | null;
  status: CrewRequestStatus;
  createdAt: string;
  updatedAt: string;
};

/** An order enriched into a job: its per-vendor rollup. */
export type Job = Order & {
  vendorSummaries: VendorSummary[];
  /** Vendor request emails that landed (outbound_messages.status = sent). */
  messagesSent: number;
};

export type JobsStats = {
  ordersInFlight: number;
  itemsPending: number;
  itemsQuoted: number;
  itemsConfirmed: number;
  crewPending: number;
  /** Distinct vendors across in-flight orders. */
  vendorsNotified: number;
  /** Vendor request emails sent across in-flight orders. */
  messagesSent: number;
  /** order_documents still waiting on the user: awaiting_signature + manual. */
  documentsPending: number;
};

export type JobsOverview = {
  jobs: Job[];
  crew: CrewRequestRow[];
  stats: JobsStats;
};

type ContractorEmbed = {
  name: string;
  photo: string | null;
  skills?: string[] | null;
  city?: string | null;
  rate_low?: number | null;
  rate_high?: number | null;
  bio?: string | null;
};

type CrewRow = {
  id: string;
  project_id?: string | null;
  contractor_id: string;
  requested_dates: string[] | null;
  location: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  contractors: ContractorEmbed | ContractorEmbed[] | null;
};

const CREW_SELECT =
  'id, project_id, contractor_id, requested_dates, location, notes, status, created_at, updated_at, ' +
  'contractors(name, photo, skills, city, rate_low, rate_high, bio)';

function toCrew(r: CrewRow): CrewRequestRow {
  // PostgREST embeds a to-one as an object, but the loose type allows an array;
  // normalize to a single contractor.
  const contractor = Array.isArray(r.contractors) ? r.contractors[0] : r.contractors;
  return {
    id: r.id,
    projectId: r.project_id ?? null,
    contractorId: r.contractor_id,
    contractorName: contractor?.name ?? 'Contractor',
    contractorPhoto: contractor?.photo ?? null,
    contractorSkills: contractor?.skills ?? [],
    contractorCity: contractor?.city ?? null,
    contractorRateLow: contractor?.rate_low ?? null,
    contractorRateHigh: contractor?.rate_high ?? null,
    contractorBio: contractor?.bio ?? null,
    requestedDates: r.requested_dates ?? [],
    location: r.location,
    notes: r.notes,
    status: r.status as CrewRequestStatus,
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

async function fetchCrewRequests(orgId: string, projectId?: string): Promise<CrewRequestRow[]> {
  const db = createAdminClient();
  let q = db.from('crew_requests').select(CREW_SELECT).eq('org_id', orgId);
  if (projectId) q = q.eq('project_id', projectId);
  const { data } = await q.order('created_at', { ascending: false });

  return ((data ?? []) as unknown as CrewRow[]).map(toCrew);
}

/**
 * Everything a signed-in org has in flight. With `projectId`, only that
 * project's orders and crew requests (the project page); without it, the whole
 * org (the /account activity tiles). The org filter always applies, so a
 * project id from another org reads as empty.
 */
export async function getJobsOverview(orgId: string, opts: { projectId?: string } = {}): Promise<JobsOverview> {
  const { projectId } = opts;
  const [allOrders, crew, sentCounts] = await Promise.all([
    listOrders(orgId),
    fetchCrewRequests(orgId, projectId).catch(() => [] as CrewRequestRow[]),
    sentCountsByOrder(orgId).catch(() => new Map<string, number>()),
  ]);

  const orders = projectId ? allOrders.filter((o) => o.projectId === projectId) : allOrders;
  const jobs: Job[] = orders.filter(isInFlight).map((order) => ({
    ...order,
    vendorSummaries: summarizeOrder(order),
    messagesSent: sentCounts.get(order.id) ?? 0,
  }));

  const documentsPending = await countPendingDocuments(
    orgId,
    projectId ? { orderIds: jobs.map((j) => j.id) } : {},
  ).catch(() => 0);

  const vendors = new Set<string>();
  const stats: JobsStats = {
    ordersInFlight: jobs.filter((j) => j.status !== 'confirmed').length,
    itemsPending: 0,
    itemsQuoted: 0,
    itemsConfirmed: 0,
    crewPending: crew.filter((c) => c.status === 'requested').length,
    vendorsNotified: 0,
    messagesSent: 0,
    documentsPending,
  };

  for (const job of jobs) {
    for (const item of job.items) {
      if (item.status === 'pending') stats.itemsPending += 1;
      else if (item.status === 'quoted') stats.itemsQuoted += 1;
      else if (item.status === 'confirmed') stats.itemsConfirmed += 1;
    }
    for (const v of job.vendorSummaries) vendors.add(v.vendor);
    stats.messagesSent += job.messagesSent;
  }
  stats.vendorsNotified = vendors.size;

  return { jobs, crew, stats };
}

/** One project's orders in flight and crew requests, for its Jobs and Crew sections. */
export function getProjectJobs(orgId: string, projectId: string): Promise<JobsOverview> {
  return getJobsOverview(orgId, { projectId });
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
 * em-dash). Leads with the requests that went out when any did: "Sent to 3
 * vendors. Newel confirmed 4 of 6 items. 2 pending."
 */
export function jobRollupCopy(job: Job): string {
  const sent =
    job.messagesSent > 0 ? `Sent to ${job.messagesSent} vendor${job.messagesSent !== 1 ? 's' : ''}. ` : '';
  return sent + itemRollupCopy(job, sent !== '');
}

function itemRollupCopy(job: Job, afterSentLine: boolean): string {
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

  if (afterSentLine) return `${totals.confirmed} of ${totals.total} items confirmed.${tailCopy}`;
  return `${job.vendorSummaries.length} vendors, ${totals.confirmed} of ${totals.total} items confirmed.${tailCopy}`;
}
