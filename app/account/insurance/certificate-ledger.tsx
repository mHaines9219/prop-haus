'use client';

import { useState } from 'react';
import { StatusToken, coiStatusSpec } from '@/components/ap/status-token';

type Certificate = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  external_id: string | null;
  status: 'pending' | 'issued' | 'failed' | 'expired';
  coverage_snapshot: Record<string, unknown>;
  document_url: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  error_message: string | null;
  created_at: string;
  order_id: string | null;
};

type Props = {
  certificates: Certificate[];
};

export function CertificateLedger({ certificates }: Props) {
  if (certificates.length === 0) {
    return (
      <div className="mt-6 border-t border-border py-8">
        <p className="font-mono text-[13px] text-text-tertiary">
          No certificates yet. COIs are issued per-vendor at checkout.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Column headers */}
      <div className="flex items-center border-b border-border pb-2">
        <span className="w-[180px] shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
          Vendor
        </span>
        <span className="w-[80px] shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
          Status
        </span>
        <span className="w-[100px] shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
          Expires
        </span>
        <span className="flex-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
          Ref
        </span>
      </div>

      {/* Rows */}
      {certificates.map((cert) => (
        <CertRow key={cert.id} cert={cert} />
      ))}
    </div>
  );
}

function CertRow({ cert }: { cert: Certificate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center py-3 text-left transition-colors hover:bg-surface-inset"
      >
        <span className="w-[180px] shrink-0 font-sans text-[13px] text-foreground">
          {cert.vendor_name}
        </span>
        <span className="w-[80px] shrink-0">
          <StatusToken {...coiStatusSpec(cert.status)} />
        </span>
        <span className="w-[100px] shrink-0 font-mono text-[13px] text-text-secondary">
          {cert.expiry_date ? formatDate(cert.expiry_date) : '—'}
        </span>
        <span className="flex-1 truncate font-mono text-[11px] text-text-tertiary">
          {cert.external_id ?? '—'}
        </span>
        {cert.document_url && (
          <a
            href={cert.document_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-4 shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
          >
            PDF
          </a>
        )}
      </button>

      {expanded && (
        <div className="px-0 pb-3">
          {cert.error_message && (
            <p className="font-mono text-[12px] text-accent-text">{cert.error_message}</p>
          )}
          {cert.effective_date && (
            <p className="font-mono text-[12px] text-text-tertiary">
              Effective {formatDate(cert.effective_date)}
              {cert.expiry_date ? ` → ${formatDate(cert.expiry_date)}` : ''}
            </p>
          )}
          {!!cert.coverage_snapshot?.['namedInsured'] && (
            <p className="mt-1 font-mono text-[12px] text-text-tertiary">
              Named insured: {String(cert.coverage_snapshot['namedInsured'])}
            </p>
          )}
          {!!cert.coverage_snapshot?.['glLimit'] && (
            <p className="font-mono text-[12px] text-text-tertiary">
              GL ${Number(cert.coverage_snapshot['glLimit']).toLocaleString()} /
              Aggregate ${Number(cert.coverage_snapshot['aggregateLimit'] ?? 0).toLocaleString()}
            </p>
          )}
          {cert.order_id && (
            <p className="font-mono text-[12px] text-text-tertiary">
              Order: {cert.order_id.slice(0, 8)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: '2-digit', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
