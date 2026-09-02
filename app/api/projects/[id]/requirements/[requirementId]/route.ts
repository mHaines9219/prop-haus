import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_PAPERWORK_BYTES } from '@/lib/paperwork';
import { attachTemplate, attachUpload, setRequirementStatus } from '@/lib/requirements/store';
import { currentSession } from '@/lib/session';

type Params = { params: Promise<{ id: string; requirementId: string }> };

const Action = z.object({ action: z.enum(['use_template', 'request', 'not_applicable', 'reset']) });

/**
 * Act on one checklist item. Two bodies:
 *   multipart with a `file` field   upload the production's own document and attach it
 *   JSON { action }                 use_template | request | not_applicable | reset
 * Every answer carries the re-evaluated checklist.
 */
export async function POST(req: Request, { params }: Params) {
  const { id, requirementId } = await params;

  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { orgId, plan } = session;

  if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PAPERWORK_BYTES + 64 * 1024) {
      return NextResponse.json({ error: 'file is too large' }, { status: 413 });
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'a file is required' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await attachUpload(orgId, id, requirementId, { name: file.name, mime: file.type, bytes }, plan);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, checklist: result.checklist });
  }

  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'action is required' }, { status: 400 });

  const result =
    parsed.data.action === 'use_template'
      ? await attachTemplate(orgId, id, requirementId, plan)
      : await setRequirementStatus(orgId, id, requirementId, parsed.data.action, plan);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, checklist: result.checklist, ...('missing' in result ? { missing: result.missing } : {}) });
}
