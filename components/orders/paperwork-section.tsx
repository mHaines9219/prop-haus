'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OrderDocument } from '@/lib/forms/documents';
import { signPagePath } from '@/lib/forms/paths';
import { StatusToken, documentStatusSpec } from '@/components/ap/status-token';

/**
 * The Paperwork section of an order page (MVP-12): one row per vendor form,
 * §9.7 list style. Prop Haus filled the data fields from the order profile;
 * anything with a signature block is the user's to sign.
 */
export function PaperworkSection({
  orderId,
  documents,
  vendorNames,
  authorized,
}: {
  orderId: string;
  documents: OrderDocument[];
  vendorNames: Record<string, string>;
  authorized: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'The request did not go through. Try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('The request did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="font-heading text-[15px] font-bold tracking-[-0.02em]">Paperwork</h2>
        <p className="font-mono text-[12px] text-text-tertiary">Filled from your profile. You sign.</p>
      </div>

      {!authorized && (
        <p className="mt-4 font-mono text-[13px] text-text-secondary">
          Forms are not filled until you authorize it on your{' '}
          <Link href="/account/profile" className="underline underline-offset-2 hover:text-foreground">
            order profile
          </Link>
          .
        </p>
      )}

      {documents.length === 0 ? (
        <div className="flex items-center justify-between py-4">
          <p className="font-mono text-[13px] text-text-tertiary">No forms filled for this order yet.</p>
          {authorized && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => post(`/api/orders/${orderId}/paperwork`, 'build')}
              className="rounded-md border border-border px-3 py-2 font-mono text-[12px] text-foreground transition-colors hover:bg-surface-raised disabled:opacity-50"
            >
              {busy === 'build' ? 'Filling' : 'Fill paperwork'}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              vendor={vendorNames[doc.vendorId] ?? doc.vendorId}
              busy={busy === doc.id}
              onRefill={() => post(`/api/forms/${doc.id}/refill`, doc.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 border-l-2 border-destructive pl-3 font-mono text-[12px] text-destructive">{error}</p>
      )}
    </section>
  );
}

function DocumentRow({
  doc,
  vendor,
  busy,
  onRefill,
}: {
  doc: OrderDocument;
  vendor: string;
  busy: boolean;
  onRefill: () => void;
}) {
  const canDownload = Boolean(doc.storagePath || doc.signedStoragePath);
  const canSign = doc.status === 'awaiting_signature';
  const canRefill = doc.status !== 'signed';

  return (
    <div className="flex items-center gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">
          <span className="text-text-secondary">{vendor}</span>
          <span className="text-text-tertiary"> · </span>
          {doc.label}
        </p>
        {doc.error && <p className="mt-1 font-mono text-[12px] text-text-tertiary">{doc.error}</p>}
        {doc.status === 'manual' && (
          <p className="mt-1 font-mono text-[12px] text-text-tertiary">
            This vendor needs a wet signature. Download, sign, and return it to them.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canSign && (
          <Link
            href={signPagePath(doc.orderId, doc.id)}
            className="rounded-md bg-accent px-3 py-2 font-mono text-[12px] font-medium text-accent-foreground transition-colors hover:opacity-90"
          >
            Sign
          </Link>
        )}
        {canDownload && (
          <a
            href={`/api/forms/${doc.id}/download`}
            className="rounded-md border border-border px-3 py-2 font-mono text-[12px] text-foreground transition-colors hover:bg-surface-raised"
          >
            Download
          </a>
        )}
        {canRefill && (
          <button
            type="button"
            disabled={busy}
            onClick={onRefill}
            className="rounded-md border border-border px-3 py-2 font-mono text-[12px] text-text-secondary transition-colors hover:bg-surface-raised disabled:opacity-50"
          >
            {busy ? 'Refilling' : 'Refill'}
          </button>
        )}
        <StatusToken {...documentStatusSpec(doc.status)} />
      </div>
    </div>
  );
}
