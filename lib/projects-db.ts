import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import type { Source } from './types';
import type { CompatibilityResult } from './insurance';
import type {
  CoiStatus,
  LineItem,
  LineStatus,
  Project,
  ProjectStatus,
  Quote,
  VendorRequest,
  VendorRequestStatus,
} from './projects';

/**
 * Row <-> object mapping for the workflow tables, kept apart from the behaviour
 * in lib/projects.ts so the query shapes are reviewable on their own.
 *
 * WHY THE SERVICE ROLE, EVERYWHERE
 *
 * The migration is explicit that all writes here are server-only
 * (20260802003000_workflow_projects.sql:17). The vendor path cannot be expressed
 * as an RLS policy at all: a vendor is UNAUTHENTICATED and their only credential
 * is the 16-byte URL token, which RLS cannot see. `getProjectByToken` reads on
 * that same basis.
 *
 * So RLS is bypassed on this path, which means **the `org_id` filters in these
 * queries are the access control**, not a convenience. Dropping one does not
 * fail a policy — it silently returns another organization's jobs. That is why
 * every org-scoped call takes `orgId` as an argument rather than reading it
 * here: the boundary stays visible at the call site.
 */

// snake_case shapes as they come back from PostgREST. Declared rather than
// generated, since no generated types exist in this repo yet.
type LineItemRow = {
  item_id: string;
  source_id: string;
  name: string;
  image: string | null;
  qty: number;
  status: LineStatus;
  quote_amount: string | number | null;
  quote_unit: Quote['unit'] | null;
  quote_periods: string | number | null;
  quote_currency: string;
  sub_note: string | null;
};

type VendorRequestRow = {
  id: string;
  vendor: Source;
  status: VendorRequestStatus;
  token: string;
  responded_at: string | null;
  coi_status: CoiStatus;
  coi_compatibility: CompatibilityResult;
  coi_requested_at: string | null;
  coi_received_at: string | null;
  coi_approved_at: string | null;
  coi_cert_url: string | null;
  line_items: LineItemRow[] | null;
};

type ProjectRow = {
  id: string;
  org_id: string;
  created_at: string;
  status: ProjectStatus;
  production_name: string;
  production_type: string;
  start_date: string;
  end_date: string;
  delivery_address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  budget: string | null;
  notes: string | null;
  approved_at: string | null;
  archived_at: string | null;
  insured: Project['insured'] | null;
  // Optional on the row type, not just nullable: this column does not exist
  // until 20260802180000 is applied, and `select *` simply omits it before then.
  share_token?: string | null;
  vendor_requests: VendorRequestRow[] | null;
};

/** The whole aggregate in one round trip. */
export const PROJECT_SELECT =
  '*, vendor_requests(*, line_items(*))';

/**
 * `numeric` arrives as a string from PostgREST — it preserves precision that a
 * JS number cannot. Every one of these is money or a multiplier, so parse
 * explicitly rather than letting `+row.x` coerce a null into 0.
 */
function num(v: string | number | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toLineItem(r: LineItemRow): LineItem {
  const amount = num(r.quote_amount);
  const periods = num(r.quote_periods);

  // The DB constraint makes a quote all-or-nothing, so a partial one should be
  // impossible. Treating it as absent rather than half-rendering is the safe
  // direction: a line with an amount and no unit would price wrongly.
  const quote: Quote | undefined =
    amount !== undefined && r.quote_unit && periods !== undefined
      ? { amount, unit: r.quote_unit, periods, currency: r.quote_currency }
      : undefined;

  return {
    itemId: r.item_id,
    sourceId: r.source_id,
    name: r.name,
    ...(r.image ? { image: r.image } : {}),
    qty: r.qty,
    status: r.status,
    ...(quote ? { quote } : {}),
    ...(r.sub_note ? { subNote: r.sub_note } : {}),
  };
}

function toVendorRequest(r: VendorRequestRow): VendorRequest {
  return {
    vendor: r.vendor,
    status: r.status,
    token: r.token,
    items: (r.line_items ?? []).map(toLineItem),
    ...(r.responded_at ? { respondedAt: r.responded_at } : {}),
    coi: {
      status: r.coi_status,
      compatibility: r.coi_compatibility,
      ...(r.coi_requested_at ? { requestedAt: r.coi_requested_at } : {}),
      ...(r.coi_received_at ? { receivedAt: r.coi_received_at } : {}),
      ...(r.coi_approved_at ? { approvedAt: r.coi_approved_at } : {}),
      ...(r.coi_cert_url ? { certUrl: r.coi_cert_url } : {}),
    },
  };
}

export function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    orgId: r.org_id,
    createdAt: r.created_at,
    status: r.status,
    productionName: r.production_name,
    productionType: r.production_type,
    startDate: r.start_date,
    endDate: r.end_date,
    deliveryAddress: r.delivery_address,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    ...(r.budget ? { budget: r.budget } : {}),
    ...(r.notes ? { notes: r.notes } : {}),
    // Ordered here rather than in the query: PostgREST cannot order an embedded
    // resource by a parent-relative key, and the UI shows vendors in a stable
    // order regardless of insert timing.
    vendors: (r.vendor_requests ?? [])
      .map(toVendorRequest)
      .sort((a, b) => a.vendor.localeCompare(b.vendor)),
    ...(r.approved_at ? { approvedAt: r.approved_at } : {}),
    ...(r.archived_at ? { archivedAt: r.archived_at } : {}),
    ...(r.insured ? { insured: r.insured } : {}),
    // Present only for owner reads. `getProjectByShareToken` strips it before
    // returning, so a client-facing render can never carry the credential that
    // got them there. See lib/projects.ts.
    ...(r.share_token ? { shareToken: r.share_token } : {}),
  };
}

export type Db = SupabaseClient;

/** Service-role client. See the header for why this path cannot use RLS. */
export function db(): Db {
  return createAdminClient();
}

export type { LineItemRow, ProjectRow, VendorRequestRow };
