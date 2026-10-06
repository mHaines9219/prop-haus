import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProject, setPaperworkStatus } from '@/lib/projects';
import { VENDOR_PAPERWORK } from '@/lib/paperwork/manifest';
import { type PaperworkFormType } from '@/lib/paperwork/schema';
import { createEtchPacket, resolveTemplateEid } from '@/lib/paperwork/anvil-client';
import { buildPayload, missingPaperworkFields } from '@/lib/paperwork/payload';
import { SOURCE_META } from '@/lib/types';

export const runtime = 'nodejs';

const Body = z.object({ projectId: z.string() });

// Public URL Anvil posts signing-completion webhooks to. Set ANVIL_WEBHOOK_URL to a
// tunnel (cloudflared/ngrok) URL when testing locally; otherwise derive from the request.
function webhookUrl(req: Request): string {
  const explicit = process.env.ANVIL_WEBHOOK_URL;
  if (explicit) return explicit;
  return new URL('/api/paperwork/webhook', req.url).toString();
}

type FormOutcome = {
  type: PaperworkFormType;
  status: 'queued' | 'missing-fields' | 'missing-template';
  missing?: string[];
};

// Build one grouped, signable Etch packet per vendor that has required paperwork.
// Called at cart checkout. Vendors with no templates in Anvil yet skip cleanly.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const project = getProject(parsed.data.projectId);
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
  if (!project.insured) {
    return NextResponse.json({ error: 'project missing business profile' }, { status: 400 });
  }
  const insured = project.insured;
  const signer = insured.paperwork?.signer ?? {
    name: insured.contact.name,
    email: insured.contact.email,
  };

  const packets: Array<{
    vendor: string;
    status: 'created' | 'skipped' | 'error';
    packetEid?: string;
    forms: FormOutcome[];
    error?: string;
  }> = [];

  for (const v of project.vendors) {
    const required = VENDOR_PAPERWORK[v.vendor]?.forms ?? [];
    if (required.length === 0) continue; // vendor needs no paperwork

    const files: Array<{ id: string; templateEid: string }> = [];
    const payloads: Record<string, { data: Record<string, unknown> }> = {};
    const forms: FormOutcome[] = [];

    for (const type of required) {
      const gaps = missingPaperworkFields(type, insured);
      if (gaps.length > 0) {
        forms.push({ type, status: 'missing-fields', missing: gaps.map((g) => g.label) });
        continue;
      }
      const templateEid = resolveTemplateEid({ type, vendor: v.vendor });
      if (!templateEid) {
        forms.push({ type, status: 'missing-template' });
        continue;
      }
      files.push({ id: type, templateEid });
      payloads[type] = {
        data: buildPayload(type, insured, v.vendor, {
          projectId: project.id,
          productionName: project.productionName,
        }) as Record<string, unknown>,
      };
      forms.push({ type, status: 'queued' });
    }

    if (files.length === 0) {
      packets.push({ vendor: v.vendor, status: 'skipped', forms });
      continue;
    }

    try {
      const { eid } = await createEtchPacket({
        name: `${project.productionName} — ${SOURCE_META[v.vendor].name} paperwork`,
        signerEmail: signer.email,
        signerName: signer.name,
        files,
        payloads,
        webhookUrl: webhookUrl(req),
      });
      // Stamp the packet eid on every form it covers so the webhook can mark them all
      // signed (findFormsByEtchPacket is one-to-many).
      for (const f of forms) {
        if (f.status === 'queued') {
          setPaperworkStatus(project.id, v.vendor, f.type, 'filled', { etchPacketEid: eid });
        }
      }
      packets.push({ vendor: v.vendor, status: 'created', packetEid: eid, forms });
    } catch (err) {
      packets.push({
        vendor: v.vendor,
        status: 'error',
        forms,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ projectId: project.id, packets });
}
