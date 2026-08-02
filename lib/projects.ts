import crypto from 'node:crypto';
import { FLAT_FEE_UNITS, type PriceUnit, type Source } from './types';
import type { BusinessProfile, CompatibilityResult } from './insurance';
import { checkCompatibility } from './insurance';
import { PROJECT_SELECT, db, toProject } from './projects-db';

export type LineStatus = 'pending' | 'available' | 'sub' | 'unavailable';
export type VendorRequestStatus = 'pending' | 'partial' | 'responded';
export type ProjectStatus = 'submitted' | 'quoting' | 'proposed' | 'confirmed' | 'cancelled';

/**
 * What a vendor actually quoted for a line — never inferred.
 *
 * `periods` is the count of billable periods at `amount`, as the VENDOR states it.
 * We prefill it from the booking window (see suggestPeriods) but the vendor owns
 * the final number, because prop houses do not bill off calendar days: a "week" is
 * commonly five working days, prep and strike are often free or half rate, and a
 * "3-day week" is a normal quote. Deriving the count ourselves would put a wrong
 * number on the document a production budgets against.
 *
 * Line total = amount x qty x periods.
 */
export type Quote = {
  amount: number;
  unit: PriceUnit;
  periods: number;
  currency: string;
};

export type LineItem = {
  itemId: string;
  sourceId: string;
  name: string;
  image?: string;
  qty: number;
  status: LineStatus;
  quote?: Quote;
  subNote?: string;
};

/** Line total for a quoted item. The one place this arithmetic lives. */
export function lineTotal(item: LineItem): number {
  if (!item.quote) return 0;
  return item.quote.amount * item.qty * item.quote.periods;
}

/** A line counts toward a total only once the vendor has said they can supply it. */
export function isBillable(item: LineItem): boolean {
  return item.status === 'available' || item.status === 'sub';
}

/**
 * A starting number for the vendor to correct, derived from the booking window.
 * Flat-fee units are always 1. Never treat the result as authoritative.
 */
export function suggestPeriods(unit: PriceUnit, startDate: string, endDate: string): number {
  if (FLAT_FEE_UNITS.includes(unit)) return 1;
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  const days = Math.floor((end - start) / 86_400_000) + 1; // inclusive of both ends
  if (unit === 'day') return Math.max(1, days);
  if (unit === 'week') return Math.max(1, Math.ceil(days / 7));
  return Math.max(1, Math.ceil(days / 30));
}

export type CoiStatus =
  | 'not-required'
  | 'gap'
  | 'needed'
  | 'requested'
  | 'received'
  | 'approved';

export type VendorCoi = {
  status: CoiStatus;
  compatibility: CompatibilityResult;
  requestedAt?: string;
  receivedAt?: string;
  approvedAt?: string;
  certUrl?: string;
};

export type VendorRequest = {
  vendor: Source;
  status: VendorRequestStatus;
  token: string;
  items: LineItem[];
  respondedAt?: string;
  coi: VendorCoi;
};

export type Project = {
  id: string;
  /** Owning organization. Server-assigned from the session — never accepted from a client. */
  orgId: string;
  createdAt: string;
  status: ProjectStatus;
  productionName: string;
  productionType: string;
  startDate: string;
  endDate: string;
  deliveryAddress: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  budget?: string;
  notes?: string;
  vendors: VendorRequest[];
  approvedAt?: string;
  /**
   * Soft-hidden from the jobs list. Orthogonal to `status` on purpose: a confirmed
   * job and a cancelled one can both be archived, and archiving should not erase
   * which one it was.
   */
  archivedAt?: string;
  insured?: BusinessProfile;
};

export type CreateProjectInput = Omit<
  Project,
  // `orgId` is omitted deliberately: ownership is an authorization decision the
  // server makes from the session, so accepting it in a request body would let a
  // caller file a project against someone else's organization.
  'id' | 'orgId' | 'createdAt' | 'status' | 'vendors' | 'approvedAt' | 'archivedAt'
> & {
  lines: Array<{
    itemId: string;
    sourceId: string;
    source: Source;
    name: string;
    image?: string;
    qty: number;
  }>;
};

export type ProposalTotals = {
  vendors: Array<{ vendor: VendorRequest; subtotal: number }>;
  grandTotal: number;
};

/**
 * The money on a proposal, in one place.
 *
 * The rendered page and the CSV export both call this rather than each summing
 * the lines themselves. Two implementations of the same arithmetic is how a
 * client ends up holding a spreadsheet whose total disagrees with the page it
 * was exported from — and this is the same code path that once priced a
 * thirty-day rental identically to a one-day one.
 */
export function proposalTotals(project: Project): ProposalTotals {
  const vendors = project.vendors.map((vendor) => ({
    vendor,
    subtotal: vendor.items.reduce((n, i) => (isBillable(i) ? n + lineTotal(i) : n), 0),
  }));
  return { vendors, grandTotal: vendors.reduce((n, v) => n + v.subtotal, 0) };
}

/**
 * Backed by Postgres (public.projects / vendor_requests / line_items).
 *
 * Was a JSON file until this change. That could not survive a deploy: serverless
 * filesystems are ephemeral and unshared, so every project, quote, COI state and
 * approval vanished between invocations. The async interface was converted first
 * precisely so this swap would touch no call site — and it did not.
 *
 * Row mapping and the service-role rationale live in lib/projects-db.ts.
 */

/** Throw rather than return empty: a read failure is not an absence of jobs. */
function orThrow<T>(what: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
}

/**
 * One organization's jobs, newest first. Archived jobs are hidden unless asked for.
 *
 * Scoped by org rather than filtered by the caller, so a missing `where` clause
 * cannot leak another org's jobs into a list view.
 */
export async function listProjects(
  orgId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Project[]> {
  // `.eq('org_id', ...)` IS the access control here — RLS is bypassed on the
  // service-role client. Removing it returns every organization's jobs and
  // nothing errors.
  let q = db().from('projects').select(PROJECT_SELECT).eq('org_id', orgId);
  if (!opts.includeArchived) q = q.is('archived_at', null);

  const rows = orThrow('listProjects', await q.order('created_at', { ascending: false }));
  return rows.map(toProject);
}

/**
 * NOT org-scoped, deliberately and as before: the project URL is shared outside
 * the owning org so a production can hand a proposal to a client. Scoping it
 * would break that link. See PLANS/PROP_HAUS_MVP_GAP_ANALYSIS.md — this wants a
 * separate share token, which is a product decision rather than a one-liner.
 */
export async function getProject(id: string): Promise<Project | undefined> {
  const { data, error } = await db()
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getProject: ${error.message}`);
  return data ? toProject(data) : undefined;
}

/**
 * The vendor's entire credential is this token, so the lookup is by token alone
 * — there is no session to scope against. `vendor_requests.token` is unique.
 */
export async function getProjectByToken(
  token: string,
): Promise<{ project: Project; vendor: VendorRequest } | null> {
  const { data, error } = await db()
    .from('vendor_requests')
    .select('project_id')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(`getProjectByToken: ${error.message}`);
  if (!data) return null;

  const project = await getProject(data.project_id as string);
  if (!project) return null;

  const vendor = project.vendors.find((v) => v.token === token);
  return vendor ? { project, vendor } : null;
}

/**
 * `orgId` comes from the session (lib/session.ts), never from the request body.
 *
 * NOT ATOMIC, and that is worth knowing rather than discovering. PostgREST
 * cannot insert a nested resource, so this is three round trips: project, then
 * its vendor requests, then their line items. If a later one fails, the project
 * is deleted — every child cascades — and the error is rethrown, so the caller
 * sees a 500 and no half-built project is ever visible.
 *
 * The compensating delete is not a transaction: if the cleanup itself fails we
 * are left with an orphan, which is logged loudly. A stored procedure would make
 * this genuinely atomic and is the right eventual answer; it is a migration
 * rather than a query, so it is not bundled into this port.
 */
export async function createProject(orgId: string, input: CreateProjectInput): Promise<Project> {
  const byVendor = new Map<Source, CreateProjectInput['lines']>();
  for (const l of input.lines) {
    const arr = byVendor.get(l.source) ?? [];
    arr.push(l);
    byVendor.set(l.source, arr);
  }

  const id = crypto.randomBytes(16).toString('hex');
  const client = db();

  orThrow(
    'createProject',
    await client
      .from('projects')
      .insert({
        id,
        org_id: orgId,
        status: 'submitted',
        production_name: input.productionName,
        production_type: input.productionType,
        start_date: input.startDate,
        end_date: input.endDate,
        delivery_address: input.deliveryAddress,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        budget: input.budget ?? null,
        notes: input.notes ?? null,
        insured: input.insured ?? null,
      })
      .select('id'),
  );

  try {
    const vendorRows = Array.from(byVendor.keys()).map((vendor) => {
      const compatibility = checkCompatibility(input.insured?.policy, vendor, {
        start: input.startDate,
        end: input.endDate,
      });
      const coiStatus: CoiStatus =
        compatibility.status === 'not-required'
          ? 'not-required'
          : compatibility.status === 'gap' || compatibility.status === 'no-policy'
            ? 'gap'
            : 'needed';
      return {
        project_id: id,
        vendor,
        status: 'pending' as VendorRequestStatus,
        token: crypto.randomBytes(16).toString('hex'),
        coi_status: coiStatus,
        coi_compatibility: compatibility,
      };
    });

    const inserted = orThrow<{ id: string; vendor: Source }[]>(
      'createProject vendors',
      await client.from('vendor_requests').insert(vendorRows).select('id, vendor'),
    );

    const byVendorId = new Map(inserted.map((v) => [v.vendor, v.id]));
    const lineRows = Array.from(byVendor.entries()).flatMap(([vendor, lines]) =>
      lines.map((l) => ({
        vendor_request_id: byVendorId.get(vendor)!,
        item_id: l.itemId,
        source_id: l.sourceId,
        name: l.name,
        image: l.image ?? null,
        qty: l.qty,
        status: 'pending' as LineStatus,
      })),
    );
    orThrow('createProject lines', await client.from('line_items').insert(lineRows).select('id'));
  } catch (e) {
    // Roll forward to "never existed" rather than leave a project with no
    // vendors, which would render as an empty request nobody can act on.
    const { error: cleanupError } = await client.from('projects').delete().eq('id', id);
    if (cleanupError) {
      console.error(
        `[projects] ORPHANED project ${id}: children failed and cleanup also failed — ${cleanupError.message}`,
      );
    }
    throw e;
  }

  const created = await getProject(id);
  if (!created) throw new Error('createProject: row vanished immediately after insert');
  return created;
}

export async function updateLineStatus(
  token: string,
  itemId: string,
  status: LineStatus,
  opts: { quote?: Quote; subNote?: string } = {},
): Promise<{ project: Project; vendor: VendorRequest } | null> {
  const client = db();

  const { data: vr, error: vrError } = await client
    .from('vendor_requests')
    .select('id, project_id')
    .eq('token', token)
    .maybeSingle();
  if (vrError) throw new Error(`updateLineStatus: ${vrError.message}`);
  if (!vr) return null;

  // Only overwrite what the vendor actually sent. `undefined` means "not part of
  // this response", which is different from clearing a previous answer.
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (opts.quote !== undefined) {
    patch.quote_amount = opts.quote.amount;
    patch.quote_unit = opts.quote.unit;
    patch.quote_periods = opts.quote.periods;
    patch.quote_currency = opts.quote.currency;
  }
  if (opts.subNote !== undefined) patch.sub_note = opts.subNote;

  const updated = orThrow<{ id: string }[]>(
    'updateLineStatus',
    await client
      .from('line_items')
      .update(patch)
      .eq('vendor_request_id', vr.id as string)
      .eq('item_id', itemId)
      .select('id'),
  );
  // Unknown item on a real token — the vendor form only ever sends its own ids,
  // so this means a stale page or a hand-made request.
  if (updated.length === 0) return null;

  // Derived state stays in app code, as the migration intends: no triggers, one
  // source of truth. Re-read rather than compute from the patch, so the rollup
  // reflects what is actually stored.
  const project = await getProject(vr.project_id as string);
  if (!project) return null;

  const vendor = project.vendors.find((v) => v.token === token);
  if (!vendor) return null;

  const anyAnswered = vendor.items.some((i) => i.status !== 'pending');
  const allAnswered = vendor.items.every((i) => i.status !== 'pending');
  const vendorStatus: VendorRequestStatus = allAnswered
    ? 'responded'
    : anyAnswered
      ? 'partial'
      : 'pending';

  orThrow(
    'updateLineStatus vendor rollup',
    await client
      .from('vendor_requests')
      .update({
        status: vendorStatus,
        ...(allAnswered ? { responded_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vr.id as string)
      .select('id'),
  );

  const others = project.vendors.filter((v) => v.token !== token);
  const statuses = [...others.map((v) => v.status), vendorStatus];
  const projectStatus: ProjectStatus | null = statuses.every((st) => st === 'responded')
    ? 'proposed'
    : statuses.some((st) => st !== 'pending')
      ? 'quoting'
      : null;

  if (projectStatus && projectStatus !== project.status) {
    orThrow(
      'updateLineStatus project rollup',
      await client
        .from('projects')
        .update({ status: projectStatus, updated_at: new Date().toISOString() })
        .eq('id', project.id)
        .select('id'),
    );
  }

  const fresh = await getProject(project.id);
  const freshVendor = fresh?.vendors.find((v) => v.token === token);
  return fresh && freshVendor ? { project: fresh, vendor: freshVendor } : null;
}

/**
 * Record where a vendor's certificate of insurance has got to.
 *
 * Scoped by org, and the scoping costs an extra round trip: the row being
 * updated lives in `vendor_requests`, which carries no `org_id` — ownership is
 * only reachable through its parent project. PostgREST cannot filter an UPDATE
 * by a joined column, so ownership is established first and the update follows.
 *
 * Not a meaningful TOCTOU: a project's owning organization is set at creation
 * and never reassigned, so the fact this checks cannot go stale between the two
 * statements.
 */
export async function setCoiStatus(
  orgId: string,
  projectId: string,
  vendor: Source,
  status: CoiStatus,
  certUrl?: string,
): Promise<Project | null> {
  const owned = orThrow<{ id: string }[]>(
    'setCoiStatus.owner',
    await db().from('projects').select('id').eq('id', projectId).eq('org_id', orgId),
  );
  if (owned.length === 0) return null;

  const now = new Date().toISOString();
  const updated = orThrow<{ id: string }[]>(
    'setCoiStatus',
    await db()
      .from('vendor_requests')
      .update({
        coi_status: status,
        ...(status === 'requested' ? { coi_requested_at: now } : {}),
        ...(status === 'received' ? { coi_received_at: now } : {}),
        ...(status === 'approved' ? { coi_approved_at: now } : {}),
        ...(certUrl !== undefined ? { coi_cert_url: certUrl } : {}),
        updated_at: now,
      })
      .eq('project_id', projectId)
      .eq('vendor', vendor)
      .select('id'),
  );
  if (updated.length === 0) return null;
  return (await getProject(projectId)) ?? null;
}

/**
 * Archive or restore a job. Scoped by org so one org cannot archive another's
 * work. Returns null when the project does not exist OR is not theirs — the
 * caller cannot tell those apart, which is the point.
 */
export async function setProjectArchived(
  orgId: string,
  id: string,
  archived: boolean,
): Promise<Project | null> {
  const updated = orThrow<{ id: string }[]>(
    'setProjectArchived',
    await db()
      .from('projects')
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id'),
  );
  if (updated.length === 0) return null;
  return (await getProject(id)) ?? null;
}

/**
 * Approve the consolidated proposal, which is what turns a set of vendor quotes
 * into a commitment to spend.
 *
 * Scoped by org, like `setProjectArchived`. Approval is an owner action and only
 * an owner action: the proposal URL is meant to be shareable with a client, so
 * anyone holding the link must be able to read the numbers and not to accept
 * them on the production's behalf.
 */
export async function approveProject(orgId: string, id: string): Promise<Project | null> {
  const now = new Date().toISOString();
  const updated = orThrow<{ id: string }[]>(
    'approveProject',
    await db()
      .from('projects')
      .update({ status: 'confirmed', approved_at: now, updated_at: now })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id'),
  );
  if (updated.length === 0) return null;
  return (await getProject(id)) ?? null;
}
