'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, postForm, postJson } from '@/lib/api';
import { MAX_PAPERWORK_BYTES, checkPaperworkFile } from '@/lib/paperwork';
import { CATEGORY_LABELS } from '@/lib/requirements/library';
import { groupByCategory, type Checklist, type ChecklistAction, type ChecklistItem } from '@/lib/requirements/evaluate';
import { fieldLabel } from '@/lib/templates/catalog';
import { StatusToken, checklistStatusSpec } from '@/components/ap/status-token';

/**
 * The paperwork checklist: one row per requirement the engine surfaced,
 * grouped by category (§9.7 list rows). Every row shows why it is here — the
 * trigger's own words — and the actions that close it. Actions post to the
 * requirement route and refresh the page so the engine's answer is the truth.
 */
export function ChecklistSection({ projectId, checklist }: { projectId: string; checklist: Checklist }) {
  const groups = groupByCategory(checklist.items);

  return (
    <div className="flex flex-col gap-8">
      {checklist.advisories.length > 0 && (
        <section>
          <div className="border-b border-border pb-2">
            <h2 className="text-[18px] font-semibold leading-[24px] text-foreground">Worth a look</h2>
          </div>
          <ul className="divide-y divide-border">
            {checklist.advisories.map((a) => (
              <li key={a.id} className="flex items-start gap-4 py-3">
                <StatusToken tone="quoted" label="REVIEW" className="mt-0.5 shrink-0" />
                <p className="text-[13px] leading-[19px] text-text-secondary">{a.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between border-b border-border pb-2">
          <h2 className="text-[18px] font-semibold leading-[24px] text-foreground">Paperwork checklist</h2>
          <p className="font-mono text-[12px] text-text-tertiary">Every row says why it is here.</p>
        </div>

        {groups.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Nothing to list yet</p>
            <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">
              Describe the production on the left. Rented props, crew, minors, stunts, and venues each bring their own paperwork.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="mt-6 first:mt-4">
              <h3 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                {CATEGORY_LABELS[g.category]}
              </h3>
              <div className="border-t border-border">
                {g.items.map((item) => (
                  <ChecklistRow key={item.requirementId} projectId={projectId} item={item} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const ACTION_LABELS: Record<Exclude<ChecklistAction, 'request'>, string> = {
  upload: 'Upload mine',
  use_template: 'Use template',
  purchase_template: 'Get template',
  not_applicable: 'Not applicable',
  reset: 'Undo',
};

function requestLabel(item: ChecklistItem): string {
  switch (item.providedBy) {
    case 'vendor':
      return 'Request from vendor';
    case 'client':
      return 'Request from client';
    case 'insurer':
      return 'Request from broker';
    case 'venue':
      return 'Request from venue';
    default:
      return 'Mark requested';
  }
}

function ChecklistRow({ projectId, item }: { projectId: string; item: ChecklistItem }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<ChecklistAction | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const url = `/api/projects/${projectId}/requirements/${item.requirementId}`;
  const muted = item.status === 'complete' || item.status === 'not_applicable';

  async function run(action: ChecklistAction, task: () => Promise<{ missing?: string[] }>) {
    setBusy(action);
    setError('');
    setNote('');
    try {
      const result = await task();
      if (result.missing && result.missing.length > 0) {
        setNote(`Filled from your profile. Left blank: ${result.missing.map(fieldLabel).join(', ')}.`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setError(err instanceof Error && err.message ? err.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function act(action: Exclude<ChecklistAction, 'upload' | 'purchase_template'>) {
    void run(action, () => postJson<{ missing?: string[] }>(url, { action }));
  }

  function upload(file: File) {
    const check = checkPaperworkFile({ name: file.name, mime: file.type, size: file.size });
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    const form = new FormData();
    form.append('file', file, file.name);
    void run('upload', () => postForm<{ ok: true; missing?: string[] }>(url, form));
  }

  return (
    <div className={'border-b border-border py-4 ' + (muted ? 'opacity-70' : '')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-[22px] text-foreground">{item.name}</p>
          <ul className="mt-1 space-y-0.5">
            {item.reasons.map((r, i) => (
              <li key={i} className="text-[13px] leading-[19px] text-text-secondary">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">{r.label}</span>
                <span className="text-text-tertiary"> · </span>
                {r.text}
              </li>
            ))}
          </ul>
          {item.jurisdictionSensitive && (
            <p className="mt-1 font-mono text-[11px] leading-[16px] text-text-tertiary">
              Depends on where you shoot. Verify locally.
            </p>
          )}
          {item.note && !muted && (
            <p className="mt-1 font-mono text-[11px] leading-[16px] text-text-tertiary">{item.note}</p>
          )}
          {item.document && (
            <p className="mt-1 font-mono text-[11px] leading-[16px] text-text-tertiary">
              {item.document.source === 'account' ? 'On file for your account: ' : 'Attached: '}
              {item.document.id ? (
                <a
                  href={`/api/projects/${projectId}/documents/${item.document.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {item.document.name}
                </a>
              ) : (
                item.document.name
              )}
            </p>
          )}
          {item.template && item.status !== 'complete' && item.status !== 'not_applicable' && (
            <p className="mt-1 font-mono text-[11px] leading-[16px] text-text-tertiary">
              {item.template.access.kind === 'included'
                ? 'Prop Haus template, prefilled from your profile. Included with your plan.'
                : `Prop Haus template. $${(item.template.access.priceCents / 100).toFixed(0)}${item.template.access.pack ? `, or included with the ${item.template.access.pack.name}` : ''}.`}
            </p>
          )}
          {note && <p className="mt-1 font-mono text-[11px] leading-[16px] text-text-secondary">{note}</p>}
          {error && <p className="mt-1 font-mono text-[12px] leading-[16px] text-accent-text">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
          {item.actions.map((action) => {
            if (action === 'upload') {
              return (
                <span key={action}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => fileRef.current?.click()}
                    className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:text-foreground disabled:opacity-40"
                  >
                    {busy === 'upload' ? 'Uploading' : ACTION_LABELS.upload}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    aria-label={`Upload ${item.name}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) upload(file);
                    }}
                  />
                </span>
              );
            }
            if (action === 'purchase_template') {
              return (
                <span key={action} className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-disabled" title="Template purchases are not open yet">
                  {ACTION_LABELS.purchase_template}
                </span>
              );
            }
            const label = action === 'request' ? requestLabel(item) : ACTION_LABELS[action];
            return (
              <button
                key={action}
                type="button"
                disabled={busy !== null}
                onClick={() => act(action)}
                className={
                  'font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 disabled:opacity-40 ' +
                  (action === 'use_template' ? 'text-foreground hover:text-text-secondary' : 'text-text-tertiary hover:text-foreground')
                }
              >
                {busy === action ? 'Working' : label}
              </button>
            );
          })}
          <StatusToken {...checklistStatusSpec(item.status, item.fulfillment)} />
        </div>
      </div>
      <p className="sr-only">Files up to {Math.round(MAX_PAPERWORK_BYTES / 1024 / 1024)} MB.</p>
    </div>
  );
}
