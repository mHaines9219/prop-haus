'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { CoiStatus, VendorRequest } from '@/lib/projects';
import type { BusinessProfile } from '@/lib/insurance';
import { buildBrokerCertEmail } from '@/lib/insurance';
import { SOURCE_META } from '@/lib/types';
import { VENDOR_COI, ENDORSEMENT_LABEL } from '@/lib/vendor-coi';
import { CoiBadge } from '@/components/coi-badge';

export function CoiVendorPanel({
  projectId,
  vendor,
  insured,
  productionName,
  startDate,
  endDate,
}: {
  projectId: string;
  vendor: VendorRequest;
  insured?: BusinessProfile;
  productionName: string;
  startDate: string;
  endDate: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [certUrl, setCertUrl] = useState(vendor.coi.certUrl ?? '');
  const req = VENDOR_COI[vendor.vendor];
  const meta = SOURCE_META[vendor.vendor];

  async function setStatus(status: CoiStatus, extraCertUrl?: string) {
    setPending(true);
    await fetch(`/api/projects/${projectId}/coi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vendor: vendor.vendor, status, certUrl: extraCertUrl }),
    });
    setPending(false);
    router.refresh();
  }

  const mailto = insured?.policy
    ? (() => {
        const e = buildBrokerCertEmail({
          productionName,
          startDate,
          endDate,
          vendorSource: vendor.vendor,
          insured,
        });
        return `mailto:${e.to}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;
      })()
    : null;

  return (
    <div className="border border-ink/15 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg">{meta?.name ?? vendor.vendor}</p>
          <p className="font-sans text-[10px] uppercase tracking-widest text-ink/50">
            requires: GL ${req.generalLiability.perOccurrence.toLocaleString()} /
            ${req.generalLiability.aggregate.toLocaleString()}
            {req.autoLiability && ` · auto $${req.autoLiability.toLocaleString()}`}
            {req.endorsements.length > 0 &&
              ` · ${req.endorsements.map((e) => ENDORSEMENT_LABEL[e]).join(', ')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CoiBadge result={vendor.coi.compatibility} />
          <StatusPill status={vendor.coi.status} />
        </div>
      </div>

      {vendor.coi.compatibility.issues.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 p-3 space-y-1">
          <p className="font-sans text-xs uppercase tracking-widest text-rose-900">Coverage gaps</p>
          <ul className="font-sans text-xs text-rose-900 list-disc pl-5">
            {vendor.coi.compatibility.issues.map((i, idx) => (
              <li key={idx}>
                <strong>{i.field}:</strong> need {i.required}, have {i.actual}
              </li>
            ))}
          </ul>
          <p className="font-sans text-xs text-rose-900/80 pt-1">
            Contact your broker about adding a rider, or talk to the vendor about adjusting requirements.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
        {vendor.coi.status === 'gap' && !insured?.policy && (
          <Link
            href={`/onboarding/insurance?next=/projects/${projectId}`}
            className="uppercase tracking-widest border border-ink/40 px-3 py-2 hover:bg-ink hover:text-paper transition"
          >
            Add insurance
          </Link>
        )}

        {mailto && vendor.coi.status !== 'received' && vendor.coi.status !== 'approved' && (
          <a
            href={mailto}
            className="uppercase tracking-widest border border-ink/40 px-3 py-2 hover:bg-ink hover:text-paper transition"
          >
            ✉ Email broker for cert
          </a>
        )}

        {vendor.coi.status !== 'requested' && vendor.coi.status !== 'received' && vendor.coi.status !== 'approved' && insured?.policy && (
          <button
            disabled={pending}
            onClick={() => setStatus('requested')}
            className="uppercase tracking-widest border border-ink/40 px-3 py-2 hover:bg-ink hover:text-paper transition disabled:opacity-50"
          >
            Mark cert requested
          </button>
        )}

        {(vendor.coi.status === 'requested' || vendor.coi.status === 'needed') && (
          <>
            <input
              type="text"
              placeholder="Paste cert URL"
              value={certUrl}
              onChange={(e) => setCertUrl(e.target.value)}
              className="border border-ink/30 px-2 py-1.5 bg-paper flex-1 min-w-[12rem]"
            />
            <button
              disabled={pending || !certUrl}
              onClick={() => setStatus('received', certUrl)}
              className="uppercase tracking-widest border border-ink/40 px-3 py-2 hover:bg-ink hover:text-paper transition disabled:opacity-50"
            >
              Mark received
            </button>
          </>
        )}

        {vendor.coi.status === 'received' && (
          <button
            disabled={pending}
            onClick={() => setStatus('approved')}
            className="uppercase tracking-widest border border-emerald-700 text-emerald-900 px-3 py-2 hover:bg-emerald-700 hover:text-paper transition disabled:opacity-50"
          >
            Vendor approved
          </button>
        )}

        {vendor.coi.certUrl && (
          <a
            href={vendor.coi.certUrl}
            target="_blank"
            rel="noreferrer"
            className="uppercase tracking-widest text-ink/60 underline"
          >
            view cert
          </a>
        )}
      </div>

      <p className="font-sans text-[10px] uppercase tracking-widest text-ink/40">
        Certificate holder: {req.certificateHolder.name} · {req.certificateHolder.address}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: CoiStatus }) {
  const map: Record<CoiStatus, string> = {
    'not-required': 'bg-ink/5 text-ink/50',
    gap: 'bg-rose-100 text-rose-900',
    needed: 'bg-amber-100 text-amber-900',
    requested: 'bg-amber-100 text-amber-900',
    received: 'bg-emerald-100 text-emerald-900',
    approved: 'bg-emerald-200 text-emerald-900',
  };
  return (
    <span className={`font-sans uppercase tracking-widest text-[10px] px-2 py-1 ${map[status]}`}>
      {status}
    </span>
  );
}
