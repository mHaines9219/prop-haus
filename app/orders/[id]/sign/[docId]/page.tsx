/**
 * /orders/[id]/sign/[docId] — where the user signs one filled form.
 *
 * Real provider: Anvil's embedded signing frame. Mock provider: a single
 * button that marks the document signed, so the flow demos with no key.
 * Prop Haus fills data fields only; the signature is always the user's.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrgId } from '@/lib/session';
import { getOrderDocument } from '@/lib/forms/documents';
import { formsProvider } from '@/lib/forms/filler';
import { PageShell } from '@/components/ap/page-shell';
import { StatusToken, documentStatusSpec } from '@/components/ap/status-token';
import { MockSignButton } from '@/components/orders/mock-sign-button';

type Props = { params: Promise<{ id: string; docId: string }> };

export default async function SignPage({ params }: Props) {
  const { id, docId } = await params;
  const orgId = await requireOrgId(`/orders/${id}/sign/${docId}`);

  const doc = await getOrderDocument(docId, orgId);
  if (!doc || doc.orderId !== id) notFound();

  const mock = formsProvider() === 'mock' || doc.signUrl?.includes('mock=1');

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">
        <div className="mb-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Order #{id.slice(0, 8).toUpperCase()} · Sign
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">{doc.label}</h1>
            <StatusToken {...documentStatusSpec(doc.status)} />
          </div>
          <p className="mt-3 max-w-[560px] text-[15px] leading-[23px] text-text-secondary">
            Filled from your order profile. Read it, then sign it yourself. Anything left blank is yours to complete.
          </p>
          {doc.error && <p className="mt-2 font-mono text-[12px] text-text-tertiary">{doc.error}</p>}
        </div>

        {doc.status === 'signed' ? (
          <p className="font-mono text-[13px] text-text-secondary">Signed. The signed copy is on the order.</p>
        ) : doc.status !== 'awaiting_signature' || !doc.signUrl ? (
          <p className="font-mono text-[13px] text-text-secondary">This document is not waiting for a signature.</p>
        ) : mock ? (
          <div className="rounded-md border border-border bg-surface-raised p-6">
            <p className="mb-5 font-mono text-[12px] text-text-tertiary">
              Mock signing. With FORMS_PROVIDER=anvil this is the Anvil signing frame.
            </p>
            <MockSignButton orderId={id} documentId={doc.id} />
          </div>
        ) : (
          <iframe
            src={doc.signUrl}
            title={`Sign ${doc.label}`}
            className="h-[80vh] w-full rounded-md border border-border bg-surface-raised"
            allow="camera; clipboard-write"
          />
        )}

        <div className="mt-10 flex gap-3">
          <Link
            href={`/orders/${id}`}
            className="rounded-md border border-border px-4 py-2.5 font-mono text-[13px] text-foreground transition-colors hover:bg-surface-raised"
          >
            Back to order
          </Link>
          {doc.storagePath && (
            <a
              href={`/api/forms/${doc.id}/download`}
              className="rounded-md border border-border px-4 py-2.5 font-mono text-[13px] text-foreground transition-colors hover:bg-surface-raised"
            >
              Download
            </a>
          )}
        </div>
      </div>
    </PageShell>
  );
}
