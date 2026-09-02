/**
 * The checklist for one project: reads the profile, the vendors on the pull,
 * the user's per-requirement state, and the org's COI on file; runs the
 * engine; and applies the user's actions (attach an upload, fill a template,
 * mark requested, mark not applicable). Server only.
 */

import { createAdminClient } from '../supabase/admin';
import { addDocument, allItems, getProject, paperworkFolder, type Project } from '../projects';
import { getOrderProfile } from '../order-profile-store';
import { checkCompatibility } from '../insurance/minimums';
import { formFiller } from '../forms/filler';
import { recordEvents } from '../analytics';
import type { PlanTier } from '../accounts';
import { CLIP_SOURCE } from '../types';
import { getTemplate, prefillTemplate, templateAccess } from '../templates/catalog';
import { getRequirement } from './library';
import { evaluate, type Advisory, type Checklist, type RequirementState } from './evaluate';
import { loadVendorPaperwork } from './vendor';

export const COI_REQUIREMENT_ID = 'certificate_of_insurance';

type StateRow = {
  requirement_id: string;
  status: 'attached' | 'awaiting' | 'not_applicable';
  document_id: string | null;
  project_documents: { id: string; name: string } | null;
};

export async function listRequirementStates(projectId: string): Promise<RequirementState[]> {
  const { data, error } = await createAdminClient()
    .from('project_requirements')
    .select('requirement_id, status, document_id, project_documents(id, name)')
    .eq('project_id', projectId);
  if (error) throw new Error(`listRequirementStates: ${error.message}`);
  return ((data ?? []) as unknown as StateRow[]).map((r) => ({
    requirementId: r.requirement_id,
    status: r.status,
    ...(r.status === 'attached' && r.project_documents ? { document: { id: r.project_documents.id, name: r.project_documents.name } } : {}),
  }));
}

async function upsertState(
  projectId: string,
  requirementId: string,
  status: RequirementState['status'],
  documentId: string | null = null,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('project_requirements')
    .upsert(
      { project_id: projectId, requirement_id: requirementId, status, document_id: documentId, updated_at: new Date().toISOString() },
      { onConflict: 'project_id,requirement_id' },
    );
  if (error) throw new Error(`upsertState: ${error.message}`);
}

async function clearState(projectId: string, requirementId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('project_requirements')
    .delete()
    .eq('project_id', projectId)
    .eq('requirement_id', requirementId);
  if (error) throw new Error(`clearState: ${error.message}`);
}

// ---- the checklist ----

export type ProjectChecklist = { project: Project; checklist: Checklist };

/** Vendors on the pull: every catalog source across the scene folders; web clips are not vendors. */
export function projectVendorIds(project: Project): string[] {
  return [...new Set(allItems(project).map((i) => i.source as string).filter((s) => s !== CLIP_SOURCE))];
}

/** Null when the project is not the org's. */
export async function buildChecklist(orgId: string, projectId: string, plan: PlanTier = 'free'): Promise<ProjectChecklist | null> {
  const project = await getProject(orgId, projectId);
  if (!project) return null;

  const [vendors, states, orderProfile] = await Promise.all([
    loadVendorPaperwork(projectVendorIds(project)),
    listRequirementStates(projectId),
    getOrderProfile(orgId),
  ]);

  const coi = orderProfile.insurance.coiDocument;
  const checklist = evaluate({
    profile: project.profile,
    vendorRequirements: vendors.requirements,
    states,
    accountDocuments: coi ? [{ requirementId: COI_REQUIREMENT_ID, name: coi.name }] : [],
    plan,
  });

  // The COI on file against each vendor's minimums: a gap is a warning on the
  // list, never a blocker and never an offer to fix it.
  if (coi) {
    const gaps: Advisory[] = [];
    for (const min of Object.values(vendors.minimums)) {
      const result = checkCompatibility(orderProfile.insurance, min);
      if (!result.compatible) {
        gaps.push({ id: `insurance_gap:${min.vendorId}`, text: `${min.vendorName}: ${result.gaps.join('. ')}.` });
      }
    }
    checklist.advisories.push(...gaps);
  }

  return { project, checklist };
}

// ---- actions ----

export type RequirementActionResult =
  | { ok: true; checklist: Checklist }
  | { ok: false; status: 400 | 402 | 404 | 500; error: string };

async function finish(orgId: string, projectId: string, plan: PlanTier): Promise<RequirementActionResult> {
  const built = await buildChecklist(orgId, projectId, plan);
  return built ? { ok: true, checklist: built.checklist } : { ok: false, status: 404, error: 'not found' };
}

/** Mark a requirement requested, not applicable, or back to evaluated. */
export async function setRequirementStatus(
  orgId: string,
  projectId: string,
  requirementId: string,
  action: 'request' | 'not_applicable' | 'reset',
  plan: PlanTier = 'free',
): Promise<RequirementActionResult> {
  if (!getRequirement(requirementId)) return { ok: false, status: 404, error: 'unknown requirement' };
  const project = await getProject(orgId, projectId);
  if (!project) return { ok: false, status: 404, error: 'not found' };

  if (action === 'reset') await clearState(projectId, requirementId);
  else await upsertState(projectId, requirementId, action === 'request' ? 'awaiting' : 'not_applicable');

  await recordEvents({ orgId, type: 'requirement_status_changed', payload: { projectId, requirementId, action } });
  return finish(orgId, projectId, plan);
}

/** Upload the production's own document into the paperwork folder and attach it to the requirement. */
export async function attachUpload(
  orgId: string,
  projectId: string,
  requirementId: string,
  file: { name: string; mime: string; bytes: Uint8Array },
  plan: PlanTier = 'free',
): Promise<RequirementActionResult> {
  if (!getRequirement(requirementId)) return { ok: false, status: 404, error: 'unknown requirement' };
  const project = await getProject(orgId, projectId);
  const folder = project && paperworkFolder(project);
  if (!project || !folder) return { ok: false, status: 404, error: 'not found' };

  const added = await addDocument(orgId, projectId, folder.id, file);
  if (!added.ok) return { ok: false, status: added.status, error: added.error };

  await upsertState(projectId, requirementId, 'attached', added.document.id);
  await recordEvents({ orgId, type: 'requirement_status_changed', payload: { projectId, requirementId, action: 'upload' } });
  return finish(orgId, projectId, plan);
}

/**
 * Produce the requirement's Prop Haus template, prefilled from the project and
 * org profiles, and attach it. Fields nothing on the profile answers stay
 * blank; the reply names them. Mock filler by default (lib/forms/filler.ts).
 */
export async function attachTemplate(
  orgId: string,
  projectId: string,
  requirementId: string,
  plan: PlanTier = 'free',
): Promise<RequirementActionResult & { missing?: string[] }> {
  const requirement = getRequirement(requirementId);
  const template = requirement?.templateId ? getTemplate(requirement.templateId) : undefined;
  if (!requirement || !template) return { ok: false, status: 404, error: 'no template for this requirement' };

  const access = templateAccess(plan, template);
  if (access.kind !== 'included') {
    return { ok: false, status: 402, error: `${template.name} is not included in this plan.` };
  }

  const project = await getProject(orgId, projectId);
  const folder = project && paperworkFolder(project);
  if (!project || !folder) return { ok: false, status: 404, error: 'not found' };

  const orderProfile = await getOrderProfile(orgId);
  const prefill = prefillTemplate(template, { projectId, projectName: project.name, profile: project.profile, orderProfile });

  let pdf: Buffer;
  try {
    const filler = await formFiller();
    pdf = await filler.fillPdf({
      templateEid: template.anvilTemplateEid ?? null,
      title: `${template.name} · ${project.name}`,
      data: prefill.data,
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Fill failed: ${(err as Error).message}` };
  }

  const added = await addDocument(orgId, projectId, folder.id, {
    name: `${template.id}.pdf`,
    mime: 'application/pdf',
    bytes: new Uint8Array(pdf),
  });
  if (!added.ok) return { ok: false, status: added.status, error: added.error };

  await upsertState(projectId, requirementId, 'attached', added.document.id);
  await recordEvents({
    orgId,
    type: 'template_used',
    payload: { projectId, requirementId, templateId: template.id, missing: prefill.missing },
  });
  const done = await finish(orgId, projectId, plan);
  return done.ok ? { ...done, missing: prefill.missing } : done;
}
