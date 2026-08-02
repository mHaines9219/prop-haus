import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Source } from './types';
import type { BusinessProfile, CompatibilityResult } from './insurance';
import { checkCompatibility } from './insurance';

export type LineStatus = 'pending' | 'available' | 'sub' | 'unavailable';
export type VendorRequestStatus = 'pending' | 'partial' | 'responded';
export type ProjectStatus = 'submitted' | 'quoting' | 'proposed' | 'confirmed' | 'cancelled';

export type LineItem = {
  itemId: string;
  sourceId: string;
  name: string;
  image?: string;
  qty: number;
  status: LineStatus;
  priceQuote?: number;
  subNote?: string;
};

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
  insured?: BusinessProfile;
};

export type CreateProjectInput = Omit<
  Project,
  'id' | 'createdAt' | 'status' | 'vendors' | 'approvedAt'
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

export async function listProjects(): Promise<Project[]> {
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

export async function createProject(input: CreateProjectInput): Promise<Project> {
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
  opts: { priceQuote?: number; subNote?: string } = {},
): Promise<{ project: Project; vendor: VendorRequest } | null> {
  const ps = await readAll();
  for (const p of ps) {
    const v = p.vendors.find((vr) => vr.token === token);
    if (!v) continue;
    const line = v.items.find((i) => i.itemId === itemId);
    if (!line) return null;
    line.status = status;
    if (opts.priceQuote !== undefined) line.priceQuote = opts.priceQuote;
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

export async function approveProject(id: string): Promise<Project | null> {
  const ps = await readAll();
  const p = ps.find((p) => p.id === id);
  if (!p) return null;
  p.status = 'confirmed';
  p.approvedAt = new Date().toISOString();
  await writeAll(ps);
  return p;
}
