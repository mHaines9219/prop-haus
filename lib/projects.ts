import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { FLAT_FEE_UNITS, type PriceUnit, type Source } from './types';
import type { BusinessProfile, CompatibilityResult } from './insurance';
import { checkCompatibility } from './insurance';

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

const FILE = path.join(process.cwd(), 'data', 'projects.json');

async function readAll(): Promise<Project[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Project[];
  } catch {
    return [];
  }
}

async function writeAll(ps: Project[]) {
  await fs.writeFile(FILE, JSON.stringify(ps, null, 2));
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
  return (await readAll())
    .filter((p) => p.orgId === orgId)
    .filter((p) => opts.includeArchived || !p.archivedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await readAll()).find((p) => p.id === id);
}

export async function getProjectByToken(
  token: string,
): Promise<{ project: Project; vendor: VendorRequest } | null> {
  for (const p of await readAll()) {
    const v = p.vendors.find((vr) => vr.token === token);
    if (v) return { project: p, vendor: v };
  }
  return null;
}

/** `orgId` comes from the session (lib/session.ts), never from the request body. */
export async function createProject(orgId: string, input: CreateProjectInput): Promise<Project> {
  const ps = await readAll();
  const byVendor = new Map<Source, LineItem[]>();
  for (const l of input.lines) {
    const arr = byVendor.get(l.source) ?? [];
    arr.push({
      itemId: l.itemId,
      sourceId: l.sourceId,
      name: l.name,
      image: l.image,
      qty: l.qty,
      status: 'pending',
    });
    byVendor.set(l.source, arr);
  }

  const project: Project = {
    id: crypto.randomBytes(16).toString('hex'),
    orgId,
    createdAt: new Date().toISOString(),
    status: 'submitted',
    productionName: input.productionName,
    productionType: input.productionType,
    startDate: input.startDate,
    endDate: input.endDate,
    deliveryAddress: input.deliveryAddress,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    budget: input.budget,
    notes: input.notes,
    vendors: Array.from(byVendor.entries()).map(([vendor, items]) => {
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
        vendor,
        status: 'pending' as VendorRequestStatus,
        token: crypto.randomBytes(16).toString('hex'),
        items,
        coi: { status: coiStatus, compatibility },
      };
    }),
  };

  ps.push(project);
  await writeAll(ps);
  return project;
}

export async function updateLineStatus(
  token: string,
  itemId: string,
  status: LineStatus,
  opts: { quote?: Quote; subNote?: string } = {},
): Promise<{ project: Project; vendor: VendorRequest } | null> {
  const ps = await readAll();
  for (const p of ps) {
    const v = p.vendors.find((vr) => vr.token === token);
    if (!v) continue;
    const line = v.items.find((i) => i.itemId === itemId);
    if (!line) return null;
    line.status = status;
    if (opts.quote !== undefined) line.quote = opts.quote;
    if (opts.subNote !== undefined) line.subNote = opts.subNote;

    const anyAnswered = v.items.some((i) => i.status !== 'pending');
    const allAnswered = v.items.every((i) => i.status !== 'pending');
    v.status = allAnswered ? 'responded' : anyAnswered ? 'partial' : 'pending';
    if (allAnswered) v.respondedAt = new Date().toISOString();

    if (p.vendors.every((vr) => vr.status === 'responded')) p.status = 'proposed';
    else if (p.vendors.some((vr) => vr.status !== 'pending')) p.status = 'quoting';

    await writeAll(ps);
    return { project: p, vendor: v };
  }
  return null;
}

export async function setCoiStatus(
  projectId: string,
  vendor: Source,
  status: CoiStatus,
  certUrl?: string,
): Promise<Project | null> {
  const ps = await readAll();
  const p = ps.find((p) => p.id === projectId);
  if (!p) return null;
  const v = p.vendors.find((vr) => vr.vendor === vendor);
  if (!v) return null;
  v.coi.status = status;
  if (status === 'requested') v.coi.requestedAt = new Date().toISOString();
  if (status === 'received') v.coi.receivedAt = new Date().toISOString();
  if (status === 'approved') v.coi.approvedAt = new Date().toISOString();
  if (certUrl !== undefined) v.coi.certUrl = certUrl;
  await writeAll(ps);
  return p;
}

/**
 * Archive or restore a job. Scoped by org so one org cannot archive another's work.
 * Returns null when the project does not exist OR is not theirs — the caller cannot
 * tell those apart, which is the point.
 */
export async function setProjectArchived(
  orgId: string,
  id: string,
  archived: boolean,
): Promise<Project | null> {
  const ps = await readAll();
  const p = ps.find((p) => p.id === id && p.orgId === orgId);
  if (!p) return null;
  if (archived) p.archivedAt = new Date().toISOString();
  else delete p.archivedAt;
  await writeAll(ps);
  return p;
}

export async function approveProject(id: string): Promise<Project | null> {
  const ps = await readAll();
  const p = ps.find((p) => p.id === id);
  if (!p) return null;
  p.status = 'confirmed';
  p.approvedAt = new Date().toISOString();
  await writeAll(ps);
  return p;
}
