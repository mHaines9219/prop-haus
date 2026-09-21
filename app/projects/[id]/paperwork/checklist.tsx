'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ApiError, postForm, postJson } from '@/lib/api';
import { MAX_PAPERWORK_BYTES, checkPaperworkFile } from '@/lib/paperwork';
import { CATEGORY_LABELS } from '@/lib/requirements/library';
import { groupByCategory, type Checklist, type ChecklistAction, type ChecklistItem, type ChecklistStatus } from '@/lib/requirements/evaluate';
import { fieldLabel } from '@/lib/templates/catalog';
import { StatusToken, checklistStatusSpec } from '@/components/ap/status-token';
import { cn } from '@/lib/utils';

/**
 * The paperwork checklist: one row per requirement the engine surfaced,
 * grouped by category (§9.7 list rows). A row reads in one line: the
 * document, the first reason it is here, the one action that closes it, and
 * its status. Everything else (every reason, the template terms, the file on
 * record, the secondary actions) sits under the row and opens on click.
 * Actions post to the requirement route and refresh the page so the engine's
 * answer is the truth.
 */
export function ChecklistSection({ projectId, checklist }: { projectId: string; checklist: Checklist }) {
  const groups = groupByCategory(checklist.items);
  const { total, complete } = checklist.summary;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-baseline justify-between border-b border-border pb-2">
          <h2 className="text-[18px] font-semibold leading-[24px] text-foreground">Paperwork checklist</h2>
          {total > 0 && (
            <p className="font-mono text-[12px] text-text-tertiary">
              <span className="font-medium text-foreground">{complete}</span> of {total} complete
            </p>
          )}
        </div>

        {total > 0 && <Progress items={checklist.items} />}

        {groups.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Nothing to list yet</p>
            <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">
              Fill in the production on the left and generate the checklist. Rented props, crew, minors, stunts, and venues each bring their own paperwork.
            </p>
          </div>
        ) : (
          groups.map((g) => {
            const done = g.items.filter((i) => i.status === 'complete' || i.status === 'not_applicable').length;
            return (
              <div key={g.category} className="mt-6">
                <div className="flex items-baseline justify-between pb-1">
                  <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    {CATEGORY_LABELS[g.category]}
                  </h3>
                  <span className="font-mono text-[11px] text-text-tertiary">
                    {done} of {g.items.length}
                  </span>
                </div>
                <div className="border-t border-border">
                  {g.items.map((item) => (
                    <ChecklistRow key={item.requirementId} projectId={projectId} item={item} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {checklist.advisories.length > 0 && (
        <section className="border-l-2 border-status-quoted pl-4">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Worth a look</h2>
          <ul className="mt-2 space-y-2">
            {checklist.advisories.map((a) => (
              <li key={a.id} className="text-[13px] leading-[19px] text-text-secondary">
                {a.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---- progress ----

const SEGMENT: Record<ChecklistStatus, string> = {
  complete: 'bg-status-confirmed',
  not_applicable: 'bg-border-strong',
  awaiting: 'bg-status-pending',
  needs_information: 'bg-status-quoted',
  missing: 'bg-border',
};

/** One segment per row, in list order, so the bar reads like the list below it. */
function Progress({ items }: { items: ChecklistItem[] }) {
  const { complete, open, needsInformation } = summarize(items);
  const parts = [
    complete > 0 && `${complete} done`,
    open > 0 && `${open} open`,
    needsInformation > 0 && `${needsInformation} need${needsInformation === 1 ? 's' : ''} information`,
  ].filter(Boolean);
  return (
    <div className="mt-3" aria-label={`Progress: ${parts.join(', ')}`}>
      <div className="flex h-[3px] gap-px" aria-hidden>
        {items.map((i) => (
          <span key={i.requirementId} className={cn('min-w-0 flex-1', SEGMENT[i.status])} />
        ))}
      </div>
      <p className="mt-2 font-mono text-[11px] leading-[14px] text-text-tertiary">{parts.join(' · ')}</p>
    </div>
  );
}

function summarize(items: ChecklistItem[]) {
  let complete = 0;
  let open = 0;
  let needsInformation = 0;
  for (const i of items) {
    if (i.status === 'complete') complete += 1;
    else if (i.status === 'needs_information') needsInformation += 1;
    else if (i.status !== 'not_applicable') open += 1;
  }
  return { complete, open, needsInformation };
}

// ---- rows ----

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

function actionLabel(item: ChecklistItem, action: ChecklistAction): string {
  return action === 'request' ? requestLabel(item) : ACTION_LABELS[action];
}

/**
 * The one action the row leads with; the rest wait under it. A ready template
 * beats an upload (the token already says TEMPLATE READY); a request beats an
 * upload on a document another party issues; a settled row leads with Undo.
 */
const LEAD_ORDER: ChecklistAction[] = ['use_template', 'request', 'upload', 'purchase_template', 'reset'];

function splitActions(item: ChecklistItem): { primary: ChecklistAction | null; secondary: ChecklistAction[] } {
  const primary = LEAD_ORDER.find((a) => item.actions.includes(a)) ?? null;
  return { primary, secondary: item.actions.filter((a) => a !== primary) };
}

const GHOST =
  'h-8 shrink-0 rounded-[2px] border border-border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 disabled:opacity-40';
const TEXT_ACTION = 'font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 disabled:opacity-40';

function ChecklistRow({ projectId, item }: { projectId: string; item: ChecklistItem }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<ChecklistAction | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const url = `/api/projects/${projectId}/requirements/${item.requirementId}`;
  const settled = item.status === 'complete' || item.status === 'not_applicable';
  const { primary, secondary } = splitActions(item);
  const lead = item.reasons[0];
  const more = item.reasons.length - 1;
  const detailsId = `req-${item.requirementId}-details`;

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

  function act(action: ChecklistAction) {
    if (action === 'upload') {
      fileRef.current?.click();
      return;
    }
    if (action === 'purchase_template') return;
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

  function renderAction(action: ChecklistAction, ghost: boolean) {
    const label = busy === action ? (action === 'upload' ? 'Uploading' : 'Working') : actionLabel(item, action);
    if (action === 'purchase_template') {
      return (
        <span key={action} className={cn(ghost ? GHOST : TEXT_ACTION, 'inline-flex items-center text-text-disabled')} title="Template purchases are not open yet">
          {label}
        </span>
      );
    }
    return (
      <button
        key={action}
        type="button"
        disabled={busy !== null}
        onClick={() => act(action)}
        className={cn(
          ghost ? GHOST : TEXT_ACTION,
          ghost
            ? action === 'use_template'
              ? 'border-foreground text-foreground hover:bg-foreground hover:text-background'
              : 'text-text-secondary hover:border-border-strong hover:text-foreground'
            : 'text-text-tertiary hover:text-foreground',
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={cn('border-b border-border', settled && 'opacity-60 transition-opacity hover:opacity-100')}>
      <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn('mt-[4px] shrink-0 text-text-tertiary transition-transform duration-150 group-hover:text-foreground', expanded && 'rotate-180')}
          />
          <span className="min-w-0">
            <span className={cn('block text-[15px] font-medium leading-[22px]', settled ? 'text-text-secondary' : 'text-foreground')}>{item.name}</span>
            {lead && !expanded && (
              <span className="mt-0.5 block truncate text-[13px] leading-[19px] text-text-tertiary">
                {lead.text}
                {more > 0 && <span className="font-mono text-[11px]"> +{more}</span>}
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-3 pl-6 sm:justify-end sm:pl-0">
          {primary && renderAction(primary, true)}
          <StatusToken {...checklistStatusSpec(item.status, item.fulfillment)} />
        </div>
      </div>

      {(note || error) && (
        <div className="pb-3 pl-6">
          {note && <p className="font-mono text-[11px] leading-[16px] text-text-secondary">{note}</p>}
          {error && <p className="font-mono text-[12px] leading-[16px] text-accent-text">{error}</p>}
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={detailsId}
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pb-4 pl-6">
              <ul className="space-y-1">
                {item.reasons.map((r, i) => (
                  <li key={i} className="text-[13px] leading-[19px] text-text-secondary">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">{r.label}</span>
                    <span className="text-text-tertiary"> · </span>
                    {r.text}
                  </li>
                ))}
              </ul>

              {(item.jurisdictionSensitive || (item.note && !settled) || item.document || (item.template && !settled)) && (
                <div className="space-y-1 font-mono text-[11px] leading-[16px] text-text-tertiary">
                  {item.jurisdictionSensitive && <p>Depends on where you shoot. Verify locally.</p>}
                  {item.note && !settled && <p>{item.note}</p>}
                  {item.template && !settled && (
                    <p>
                      {item.template.access.kind === 'included'
                        ? 'Prop Haus template, prefilled from your profile. Included with your plan.'
                        : `Prop Haus template. $${(item.template.access.priceCents / 100).toFixed(0)}${item.template.access.pack ? `, or included with the ${item.template.access.pack.name}` : ''}.`}
                    </p>
                  )}
                  {item.document && (
                    <p>
                      {item.document.source === 'account' ? 'On file for your account: ' : 'Attached: '}
                      {item.document.id ? (
                        <a
                          href={`/api/projects/${projectId}/documents/${item.document.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-text-secondary underline underline-offset-2 hover:text-foreground"
                        >
                          {item.document.name}
                        </a>
                      ) : (
                        item.document.name
                      )}
                    </p>
                  )}
                </div>
              )}

              {secondary.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {secondary.map((action) => renderAction(action, false))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {item.actions.includes('upload') && (
        <>
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
          <p className="sr-only">Files up to {Math.round(MAX_PAPERWORK_BYTES / 1024 / 1024)} MB.</p>
        </>
      )}
    </div>
  );
}
