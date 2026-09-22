'use client';

import { useRef, useState } from 'react';
import { deleteJson, patchJson, postForm } from '@/lib/api';
import {
  PASSPORT_KINDS,
  PASSPORT_KIND_SPECS,
  isExpired,
  passportSummary,
  type Passport,
  type PassportDocument,
  type PassportKind,
  type PassportSummary,
} from '@/lib/passport';
import { StatusToken } from '@/components/ap/status-token';

const INPUT =
  'w-full rounded-[2px] border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-foreground';

type Props = { initialPassport: Passport; initialSummary: PassportSummary };

export function PassportWallet({ initialPassport, initialSummary }: Props) {
  const [passport, setPassport] = useState(initialPassport);
  const [summary, setSummary] = useState(initialSummary);

  function setDocument(kind: PassportKind, document: PassportDocument | undefined) {
    setPassport((p) => {
      const documents = { ...p.documents };
      if (document) documents[kind] = document;
      else delete documents[kind];
      const next = { documents };
      setSummary(passportSummary(next));
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Documents
        </h2>
        <SummaryBadge summary={summary} />
      </div>

      <div className="mt-4">
        {PASSPORT_KINDS.map((kind, i) => (
          <DocumentRow
            key={kind}
            kind={kind}
            document={passport.documents[kind]}
            last={i === PASSPORT_KINDS.length - 1}
            onChange={(doc) => setDocument(kind, doc)}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryBadge({ summary }: { summary: PassportSummary }) {
  if (summary.expired.length > 0) {
    return <StatusToken tone="unavailable" label={`${summary.expired.length} expired`} />;
  }
  if (summary.onFile === summary.total) return <StatusToken tone="confirmed" label="Complete" />;
  return (
    <span className="font-mono text-[12px] tabular-nums text-text-tertiary">
      {summary.onFile} of {summary.total} on file
    </span>
  );
}

function DocumentRow({
  kind,
  document,
  last,
  onChange,
}: {
  kind: PassportKind;
  document: PassportDocument | undefined;
  last: boolean;
  onChange: (d: PassportDocument | undefined) => void;
}) {
  const spec = PASSPORT_KIND_SPECS[kind];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(document?.expiresAt?.slice(0, 10) ?? '');
  const [reference, setReference] = useState(document?.reference ?? '');
  const expired = isExpired(document?.expiresAt);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void run(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const { document } = await postForm<{ document: PassportDocument }>(`/api/account/passport/${kind}`, fd);
      onChange(document);
      setExpiresAt(document.expiresAt?.slice(0, 10) ?? '');
      setReference(document.reference ?? '');
    });
  }

  function saveMeta() {
    if (!document) return;
    const same =
      (document.expiresAt?.slice(0, 10) ?? '') === expiresAt && (document.reference ?? '') === reference;
    if (same) return;
    void run(async () => {
      const res = await patchJson<{ document: PassportDocument }>(`/api/account/passport/${kind}`, {
        expiresAt: expiresAt || undefined,
        reference: reference || undefined,
      });
      onChange(res.document);
    });
  }

  function remove() {
    void run(async () => {
      await deleteJson(`/api/account/passport/${kind}`);
      onChange(undefined);
      setExpiresAt('');
      setReference('');
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 border-t border-border py-4 sm:flex-row sm:items-start ${last ? 'border-b' : ''}`}
    >
      <div className="w-[240px] shrink-0 pt-1">
        <p className="text-[14px] text-foreground">{spec.label}</p>
        <p className="mt-1 font-mono text-[11px] leading-[16px] text-text-disabled">{spec.usedFor}</p>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {document ? (
            <span className="font-mono text-[13px] text-foreground">
              <a href={`/api/account/passport/${kind}`} className="underline underline-offset-4">
                {document.name}
              </a>
              <span className="text-text-tertiary"> · uploaded {formatDate(document.uploadedAt)}</span>
            </span>
          ) : (
            <span className="font-mono text-[13px] text-text-tertiary">Nothing on file</span>
          )}
          {expired && <StatusToken tone="unavailable" label="Expired" />}
          <input
            ref={input}
            type="file"
            accept={spec.pdfOrImageOnly ? 'application/pdf,image/*' : undefined}
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-accent-text underline underline-offset-4 disabled:opacity-50"
          >
            {busy ? 'Working…' : document ? 'Replace' : 'Upload'}
          </button>
          {document && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-text-tertiary underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            >
              Remove
            </button>
          )}
          {error && <span className="font-mono text-[12px] text-accent-text">{error}</span>}
        </div>

        {document && (spec.expires || spec.referenceLabel) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {spec.expires && (
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                  Expires
                </span>
                <input
                  className={`${INPUT} mt-1`}
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  onBlur={saveMeta}
                />
              </label>
            )}
            {spec.referenceLabel && (
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                  {spec.referenceLabel}
                </span>
                <input
                  className={`${INPUT} mt-1`}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  onBlur={saveMeta}
                />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
