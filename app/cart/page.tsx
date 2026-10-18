'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useCart, type CartLine } from '@/lib/cart-store';
import { SOURCE_META, type Source } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import { OutreachDrawer } from '@/components/ap/outreach-drawer';
import { Tooltip } from '@/components/ap/tooltip';
import { ApiError, getJson, postForm, postJson } from '@/lib/api';
import {
  AUTHORIZATION_SENTENCE,
  EMPTY_ORDER_PROFILE,
  orderReadiness,
  orderRequestReadiness,
  type OrderDefaults,
  type ProductionSummary,
} from '@/lib/order-profile';
import type { Draft } from '@/lib/outreach/compose';
import type { ProjectSummary } from '@/lib/projects';
import { EMPTY_PASSPORT, type Passport, type PassportDocument } from '@/lib/passport';
import { askedByLine, cartDocuments, type CartDocument } from '@/lib/checkout-documents';

type CheckoutState = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

type Drafts = { loading: boolean; list: Draft[] | null; error?: boolean };
type Edit = { subject: string; bodyText: string };

type Readiness =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'unreadable' }
  | {
      kind: 'loaded';
      /** What the profile still lacks. Non-empty means the form asks for the production too. */
      missing: string[];
      defaults: OrderDefaults & { rentalWindowDays?: number };
      production: ProductionSummary;
      projects: ProjectSummary[];
      /** What is on file, so the Documents group can ask for what the cart's vendors want and do not have. */
      passport: Passport;
    };

/**
 * The one form. What every rental house needs before it can answer: who is
 * asking (only until the profile has it), the dates, and what the shoot is.
 * Prefilled from the profile; sent to every vendor with the click. There is
 * no location: pickup at the vendor's dock is assumed (see PICKUP_NOTE).
 */
type RequestForm = {
  legalName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  formsOnBehalf: boolean;
  rentalStart: string;
  rentalEnd: string;
  shootDetails: string;
};

/** Why the form has no delivery option. Most LA houses are will-call only (docs/vendor-requirements-scan.md §4). */
const PICKUP_NOTE =
  'Some prop houses deliver, but most do not, so there is no delivery option here. Plan a truck for pickup and return, and ask a vendor directly if you need delivery.';

const EMPTY_FORM: RequestForm = {
  legalName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  formsOnBehalf: false,
  rentalStart: '',
  rentalEnd: '',
  shootDetails: '',
};

const EYEBROW = 'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary';
const LABEL = 'block font-mono text-[12px] text-text-secondary mb-1.5';

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-foreground aria-[invalid=true]:border-destructive';

/** How long the preview waits after a keystroke before redrafting the emails. */
const PREVIEW_DEBOUNCE_MS = 300;

export default function CartPage() {
  const router = useRouter();
  const { lines, remove, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  // Set on a click that found gaps; from then on the form marks what is missing as the user types.
  const [showGaps, setShowGaps] = useState(false);
  const [state, setState] = useState<CheckoutState>({ kind: 'idle' });
  const [readiness, setReadiness] = useState<Readiness>({ kind: 'loading' });
  // The passport as the cart last saw it. An upload from the Documents group
  // lands here as soon as the server has it, so the row and the drafts follow.
  const [passport, setPassport] = useState<Passport>(EMPTY_PASSPORT);
  // The project the order lands on (its Jobs section lists it). Starts on the
  // most recently touched project; '' places the order on none.
  const [projectId, setProjectId] = useState<string | null>(null);
  // Stable key for the lifetime of this cart session — prevents double-submit.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // The vendor emails the click will send. Drafted server-side from the same
  // input as checkout; edits live here and ride along with the click.
  const [emailsOpen, setEmailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({ loading: false, list: null });
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [openVendor, setOpenVendor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadReadiness().then((r) => {
      if (cancelled) return;
      setReadiness(r);
      if (r.kind === 'loaded') {
        setProjectId((current) => current ?? r.projects[0]?.id ?? '');
        setForm(prefill(r.defaults, r.production));
        setPassport(r.passport);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const vendors = Array.from(new Set(lines.map((l) => l.item.source)));
  const linesKey = lines.map((l) => l.item.id).join('|');

  // What the cart's vendors ask a new customer for, against the passport.
  // Computed, never configured: the vendors in the cart decide the rows.
  const documents = cartDocuments(vendors, passport);
  const documentsKey = documents.map((d) => `${d.kind}:${d.status}`).join('|');

  // The profile was short when the cart loaded, so the form asks for the
  // production too and the click saves it. Stays true until the next load.
  const needsProduction = readiness.kind === 'loaded' && readiness.missing.length > 0;
  const request = toRequest(form, needsProduction);
  const gaps = [...(needsProduction ? productionGaps(form) : []), ...orderRequestReadiness(request).missing];
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    if (!emailsOpen || readiness.kind !== 'loaded' || lines.length === 0) return;
    let cancelled = false;
    setDrafts((d) => ({ ...d, loading: true, error: false }));
    const timer = setTimeout(() => {
      postJson<{ drafts: Draft[] }>('/api/checkout/preview', { lines: toLineInputs(lines), ...request })
        .then((r) => {
          if (!cancelled) setDrafts({ loading: false, list: r.drafts });
        })
        .catch(() => {
          if (!cancelled) setDrafts({ loading: false, list: null, error: true });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // linesKey, requestKey and documentsKey stand in for `lines`, `request`
    // and the passport so a re-render with the same cart, form and documents
    // does not refetch; a fresh upload does, so the draft shows the attachment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailsOpen, readiness.kind, linesKey, requestKey, documentsKey]);

  const openDraft = drafts.list?.find((d) => d.vendorId === openVendor) ?? null;
  const openEdit = openDraft ? edits[openDraft.vendorId] : undefined;

  function editDraft(draft: Draft, patch: Partial<Edit>) {
    setEdits((e) => {
      const current = e[draft.vendorId] ?? { subject: draft.subject, bodyText: draft.bodyText };
      const next = { ...current, ...patch };
      const { [draft.vendorId]: _, ...rest } = e;
      // Back to the draft's own words is not an edit.
      if (next.subject === draft.subject && next.bodyText === draft.bodyText) return rest;
      return { ...rest, [draft.vendorId]: next };
    });
  }

  function resetDraft(vendorId: string) {
    setEdits((e) => {
      const { [vendorId]: _, ...rest } = e;
      return rest;
    });
  }

  function setField<K extends keyof RequestForm>(key: K, value: RequestForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (state.kind === 'error') setState({ kind: 'idle' });
  }

  async function handlePlaceOrder() {
    if (state.kind === 'submitting') return;
    if (gaps.length > 0) {
      setShowGaps(true);
      setState({ kind: 'error', message: gapsMessage(gaps, form) });
      return;
    }
    setState({ kind: 'submitting' });

    try {
      const { id } = await postJson<{ id: string }>('/api/checkout', {
        lines: toLineInputs(lines),
        ...request,
        messages: Object.entries(edits).map(([vendorId, e]) => ({ vendorId, ...e })),
        projectId: projectId || undefined,
        idempotencyKey,
      });

      clear();
      router.push(`/orders/${id}`);
    } catch (err) {
      const requestIncomplete = err instanceof ApiError && err.status === 422 && err.message === 'request is incomplete';
      const profileIncomplete = err instanceof ApiError && err.status === 422 && !requestIncomplete;
      const message = requestIncomplete
        ? gapsMessage(gaps, form)
        : profileIncomplete
          ? 'Your order profile is missing something. Fill it in below.'
          : 'Something went wrong — please try again.';
      if (requestIncomplete) setShowGaps(true);
      setState({ kind: 'error', message });
      // A fresh read opens the production fields with what the server still wants; the form keeps what was typed.
      if (profileIncomplete) setReadiness(await loadReadiness());
    }
  }

  // Avoid hydration mismatch — cart is persisted client-side.
  if (!mounted) return null;

  const invalid = (gap: string) => showGaps && gaps.includes(gap);

  return (
    <>
      <PageShell>
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">

          {/* Page header */}
          <div className="mb-10">
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-secondary ink-underline hover:text-foreground"
            >
              <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
              Back to home
            </Link>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              {lines.length} item{lines.length !== 1 ? 's' : ''}{vendors.length > 0 ? ` · ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}` : ''}
            </p>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
              Cart
            </h1>
          </div>

          {lines.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-[22px] font-bold">Your cart is empty</p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Browse the catalog and add pieces from any vendor.
              </p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-md border border-foreground px-5 py-2.5 font-mono text-[13px] font-medium text-foreground lift-sm hover:bg-foreground hover:text-background"
              >
                Browse catalog
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px] lg:items-start">

              {/* Item list */}
              <div>
                <div className="divide-y divide-border">
                  {lines.map((line) => {
                    const href = `/item/${line.item.source}/${encodeURIComponent(line.item.sourceId)}`;
                    const vendorName = SOURCE_META[line.item.source as Source]?.name ?? line.item.source;
                    return (
                      <div key={line.item.id} className="flex gap-4 py-5">
                        <Link href={href} className="group shrink-0">
                          <LightWell
                            src={line.item.images[0]}
                            alt={line.item.name}
                            name={line.item.name}
                            sizes="96px"
                            className="w-24"
                          />
                        </Link>
                        <div className="flex flex-1 flex-col justify-between py-0.5">
                          <div>
                            <Link href={href} className="font-medium leading-snug hover:underline">
                              {line.item.name}
                            </Link>
                            <p className="mt-1 font-mono text-[12px] text-text-tertiary">{vendorName}</p>
                          </div>
                          <button
                            onClick={() => remove(line.item.id)}
                            className="self-start font-mono text-[12px] text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <button
                    onClick={clear}
                    className="font-mono text-[12px] text-text-tertiary underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear cart
                  </button>
                </div>
              </div>

              {/* Request panel: the one form every vendor's email is written from */}
              <div className="space-y-5 lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-88px)] lg:overflow-y-auto">
                <div className="rounded-md border border-border bg-surface-raised p-5">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Your request
                  </p>
                  <p className="mt-1 text-[13px] leading-[20px] text-text-secondary">
                    What every vendor needs to answer. One form; the click sends it to each of them.
                  </p>

                  {needsProduction && readiness.kind === 'loaded' && (
                    <fieldset className="mt-5">
                      <legend className={EYEBROW}>Your production</legend>
                      <p className="mt-1 font-mono text-[11px] leading-[14px] text-text-tertiary">
                        Asked once. Saved to your order profile with the click.
                      </p>
                      <div className="mt-2 space-y-2">
                        <div>
                          <label htmlFor="req-legal-name" className={LABEL}>
                            Company legal name
                          </label>
                          <input
                            id="req-legal-name"
                            value={form.legalName}
                            onChange={(e) => setField('legalName', e.target.value)}
                            autoComplete="organization"
                            aria-invalid={invalid('Company legal name')}
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label htmlFor="req-contact-name" className={LABEL}>
                            Ordering contact
                          </label>
                          <input
                            id="req-contact-name"
                            value={form.contactName}
                            onChange={(e) => setField('contactName', e.target.value)}
                            placeholder="Name"
                            autoComplete="name"
                            aria-invalid={invalid('Ordering contact name')}
                            className={INPUT}
                          />
                        </div>
                        <div className="grid grid-cols-[1fr_120px] gap-2">
                          <input
                            aria-label="Contact email"
                            type="email"
                            value={form.contactEmail}
                            onChange={(e) => setField('contactEmail', e.target.value)}
                            placeholder="Email"
                            autoComplete="email"
                            aria-invalid={invalid('Ordering contact email')}
                            className={INPUT}
                          />
                          <input
                            aria-label="Contact phone"
                            type="tel"
                            value={form.contactPhone}
                            onChange={(e) => setField('contactPhone', e.target.value)}
                            placeholder="Phone"
                            autoComplete="tel"
                            className={INPUT}
                          />
                        </div>
                        <label className="flex cursor-pointer items-start gap-3 pt-1">
                          <input
                            type="checkbox"
                            checked={form.formsOnBehalf}
                            onChange={(e) => setField('formsOnBehalf', e.target.checked)}
                            aria-invalid={invalid('Authorization to complete forms')}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                          />
                          <span className="text-[13px] leading-[20px] text-foreground">{AUTHORIZATION_SENTENCE}</span>
                        </label>
                        <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
                          Insurance on file and billing details live on your{' '}
                          <Link href="/account/profile" className="text-accent-text underline underline-offset-2">
                            order profile
                          </Link>
                          .
                        </p>
                      </div>
                    </fieldset>
                  )}

                  {readiness.kind === 'loaded' && readiness.projects.length > 0 && (
                    <div className="mt-5">
                      <label htmlFor="cart-project" className={LABEL}>
                        Project
                      </label>
                      <select
                        id="cart-project"
                        value={projectId ?? ''}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                      >
                        {readiness.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        <option value="">No project</option>
                      </select>
                      <p className="mt-1 font-mono text-[11px] leading-[14px] text-text-tertiary">
                        The order shows under this project&apos;s jobs.
                      </p>
                    </div>
                  )}

                  {readiness.kind === 'loaded' && (
                    <div className="mt-5 space-y-5">
                      <fieldset>
                        <legend className={EYEBROW}>
                          Dates requested
                        </legend>
                        <div className="mt-2 grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="req-start" className={LABEL}>
                              Start
                            </label>
                            <input
                              id="req-start"
                              type="date"
                              value={form.rentalStart}
                              onChange={(e) => setField('rentalStart', e.target.value)}
                              aria-invalid={invalid('Rental dates')}
                              className={INPUT}
                            />
                          </div>
                          <div>
                            <label htmlFor="req-end" className={LABEL}>
                              End
                            </label>
                            <input
                              id="req-end"
                              type="date"
                              min={form.rentalStart || undefined}
                              value={form.rentalEnd}
                              onChange={(e) => setField('rentalEnd', e.target.value)}
                              aria-invalid={invalid('Rental dates')}
                              className={INPUT}
                            />
                          </div>
                        </div>
                        <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
                          <span>Pickup and return at each vendor&apos;s dock.</span>
                          <Tooltip label="Why there is no delivery option" content={PICKUP_NOTE}>
                            <Info size={12} strokeWidth={1.5} aria-hidden />
                          </Tooltip>
                        </p>
                      </fieldset>

                      <fieldset>
                        <legend className={EYEBROW}>
                          Shoot details
                        </legend>
                        <p className="mt-1 font-mono text-[11px] leading-[14px] text-text-tertiary">
                          What you&apos;re shooting and how the pieces are used. Optional.
                        </p>
                        <textarea
                          id="req-shoot"
                          aria-label="Shoot details"
                          value={form.shootDetails}
                          onChange={(e) => setField('shootDetails', e.target.value)}
                          rows={3}
                          placeholder="Two-day commercial, living room set, pieces on camera…"
                          className={cn(INPUT, 'mt-2 resize-none')}
                        />
                      </fieldset>

                      {documents.length > 0 && (
                        <fieldset>
                          <legend className={EYEBROW}>Documents</legend>
                          <p className="mt-1 font-mono text-[11px] leading-[14px] text-text-tertiary">
                            What these vendors ask a new customer for. Kept on your{' '}
                            <Link href="/account/passport" className="text-accent-text underline underline-offset-2">
                              passport
                            </Link>{' '}
                            and attached to each request. Anything missing is noted as to follow.
                          </p>
                          <ul className="mt-2 divide-y divide-border border-y border-border">
                            {documents.map((d) => (
                              <DocumentRow
                                key={d.kind}
                                doc={d}
                                onUploaded={(document) =>
                                  setPassport((p) => ({ documents: { ...p.documents, [d.kind]: document } }))
                                }
                              />
                            ))}
                          </ul>
                        </fieldset>
                      )}
                    </div>
                  )}

                  {readiness.kind === 'unreadable' && (
                    <p className="mt-4 font-mono text-[13px] text-text-secondary">
                      Your order profile could not be read. Reload to try again, or{' '}
                      <Link href="/account/profile" className="text-accent-text underline underline-offset-4">
                        open your profile
                      </Link>
                      .
                    </p>
                  )}

                  {readiness.kind === 'anon' && (
                    <p className="mt-4 font-mono text-[13px] text-text-secondary">
                      <Link href="/login?next=/cart" className="text-accent-text underline underline-offset-4">
                        Sign in
                      </Link>{' '}
                      to place an order.
                    </p>
                  )}

                  {readiness.kind === 'loading' && (
                    <p className="mt-4 font-mono text-[13px] text-text-tertiary">Reading your profile…</p>
                  )}
                </div>

                {readiness.kind === 'loaded' && (
                  <div className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => setEmailsOpen((o) => !o)}
                      aria-expanded={emailsOpen}
                      className="flex w-full items-center justify-between py-3 font-mono text-[12px] text-text-secondary transition-colors hover:text-foreground"
                    >
                      <span>Review the emails</span>
                      <ChevronRight
                        size={14}
                        strokeWidth={1.5}
                        className={cn('transition-transform duration-150', emailsOpen && 'rotate-90')}
                      />
                    </button>
                    {emailsOpen && (
                      <div className="pb-3">
                        {drafts.list === null && drafts.loading && (
                          <p className="font-mono text-[12px] text-text-tertiary">Writing the drafts…</p>
                        )}
                        {drafts.error && (
                          <p className="font-mono text-[12px] text-accent-text">The drafts did not load. Try again.</p>
                        )}
                        {drafts.list && (
                          <ul className="divide-y divide-border border-t border-border">
                            {drafts.list.map((d) => {
                              const e = edits[d.vendorId];
                              return (
                                <li key={d.vendorId}>
                                  <button
                                    type="button"
                                    onClick={() => setOpenVendor(d.vendorId)}
                                    className="w-full py-3 text-left transition-colors hover:bg-surface-raised"
                                  >
                                    <div className="flex items-baseline justify-between gap-3">
                                      <span className="text-[14px] font-medium">{d.vendorName}</span>
                                      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                                        {e ? 'Edited' : 'Draft'}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 truncate font-mono text-[12px] text-text-tertiary">
                                      {d.to || 'No address on file'}
                                    </p>
                                    <p className="mt-0.5 truncate text-[13px] text-text-secondary">
                                      {e?.subject ?? d.subject}
                                    </p>
                                    {d.warnings.map((w) => (
                                      <p key={w} className="mt-1 font-mono text-[12px] text-accent-text">
                                        {w}
                                      </p>
                                    ))}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <p className="mt-2 font-mono text-[11px] leading-relaxed text-text-tertiary">
                          Sent as written with the click. Open one to read or change it.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-baseline justify-between border-b border-border pb-3">
                  <span className="text-[13px] text-text-tertiary">Estimate, pending vendor quotes</span>
                  <span className="font-mono text-[13px] font-medium text-foreground">—</span>
                </div>

                {state.kind === 'error' && (
                  <p role="alert" className="font-mono text-[12px] text-accent-text">{state.message}</p>
                )}

                {readiness.kind === 'loaded' && (
                  <button
                    onClick={handlePlaceOrder}
                    disabled={state.kind === 'submitting'}
                    className="w-full rounded-md border border-foreground py-3 font-mono text-[13px] font-medium text-foreground lift-sm hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {state.kind === 'submitting'
                      ? 'Placing order and sending…'
                      : `Place order and send to ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}`}
                  </button>
                )}

                <p className="font-mono text-[11px] text-text-tertiary leading-relaxed">
                  Pricing is confirmed with each vendor after you place your order.
                  Payment is not collected at checkout.
                </p>
              </div>
            </div>
          )}
        </div>
      </PageShell>

      <OutreachDrawer
        message={
          openDraft
            ? {
                vendorName: openDraft.vendorName,
                to: openDraft.to,
                cc: openDraft.cc,
                replyTo: openDraft.replyTo,
                subject: openEdit?.subject ?? openDraft.subject,
                bodyText: openEdit?.bodyText ?? openDraft.bodyText,
                attachments: openDraft.attachments,
                warnings: openDraft.warnings,
              }
            : null
        }
        onClose={() => setOpenVendor(null)}
        editing={
          openDraft
            ? {
                edited: Boolean(openEdit),
                onChange: (patch) => editDraft(openDraft, patch),
                onReset: () => resetDraft(openDraft.vendorId),
              }
            : undefined
        }
      />
    </>
  );
}

/**
 * One document a vendor in the cart asks for. Uploading stores it on the
 * passport right away (the same slot /account/passport uses), so the next
 * cart does not ask again and this one attaches it.
 */
function DocumentRow({ doc, onUploaded }: { doc: CartDocument; onUploaded: (d: PassportDocument) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { document } = await postForm<{ document: PassportDocument }>(`/api/account/passport/${doc.kind}`, fd);
      onUploaded(document);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The upload did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-foreground">{doc.label}</span>
        <span className="shrink-0">
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            aria-label={`Upload ${doc.label}`}
            onChange={handleFile}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-accent-text underline underline-offset-4 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : doc.status === 'missing' ? 'Upload' : 'Replace'}
          </button>
        </span>
      </div>
      <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">{askedByLine(doc)}</p>
      <p className="mt-0.5 min-w-0 break-all font-mono text-[11px] leading-[14px]">
        {doc.status === 'missing' ? (
          <span className="text-text-tertiary">Not on file. Noted as to follow.</span>
        ) : (
          <>
            <span className="text-text-secondary">{doc.document!.name}</span>
            {doc.status === 'expired' ? (
              <span className="text-accent-text"> · Expired</span>
            ) : (
              <span className="text-text-tertiary"> · On file, attached</span>
            )}
          </>
        )}
        {error && <span className="text-accent-text"> · {error}</span>}
      </p>
    </li>
  );
}

/** The cart, in the shape both /api/checkout and /api/checkout/preview take. */
function toLineInputs(lines: CartLine[]) {
  return lines.map((l) => ({
    itemId: l.item.id,
    source: l.item.source,
    sourceId: l.item.sourceId,
    name: l.item.name,
    image: l.item.images[0] ?? null,
    sourceUrl: l.item.sourceUrl,
    vendor: SOURCE_META[l.item.source as Source]?.name ?? l.item.source,
  }));
}

/** The form prefilled from the profile: its production fields and the default rental window. */
function prefill(d: OrderDefaults, p: ProductionSummary): RequestForm {
  return {
    legalName: p.legalName ?? '',
    contactName: p.contactName ?? '',
    contactEmail: p.contactEmail ?? '',
    contactPhone: p.contactPhone ?? '',
    formsOnBehalf: p.formsOnBehalf,
    rentalStart: d.rentalStart ?? '',
    rentalEnd: d.rentalEnd ?? '',
    shootDetails: '',
  };
}

/** The form as the API takes it: blanks dropped, text trimmed, undefined for nothing. */
function toRequest(f: RequestForm, withProduction: boolean) {
  const production = withProduction
    ? {
        legalName: f.legalName.trim() || undefined,
        contactName: f.contactName.trim() || undefined,
        contactEmail: f.contactEmail.trim() || undefined,
        contactPhone: f.contactPhone.trim() || undefined,
        formsOnBehalf: f.formsOnBehalf || undefined,
      }
    : undefined;
  return {
    production,
    rentalStart: f.rentalStart || undefined,
    rentalEnd: f.rentalEnd || undefined,
    shootDetails: f.shootDetails.trim() || undefined,
  };
}

/** The production fields the profile wants, judged by the same rule the server uses. */
function productionGaps(f: RequestForm): string[] {
  return orderReadiness({
    ...EMPTY_ORDER_PROFILE,
    company: { legalName: f.legalName.trim() || undefined },
    contacts: { ordering: { name: f.contactName.trim() || undefined, email: f.contactEmail.trim() || undefined } },
    authorization: { formsOnBehalf: f.formsOnBehalf },
  }).missing;
}

/** One sentence naming what the click still needs. */
function gapsMessage(gaps: string[], form: RequestForm): string {
  if (gaps.includes('Rental dates') && form.rentalStart && form.rentalEnd) {
    return 'The rental end date is before the start.';
  }
  return `Still needed: ${gaps.join(', ')}.`;
}

async function loadReadiness(): Promise<Readiness> {
  try {
    const r = await getJson<{
      ready: boolean;
      missing: string[];
      defaults: OrderDefaults & { rentalWindowDays?: number };
      production?: ProductionSummary;
      projects?: ProjectSummary[];
      passport?: Passport;
    }>('/api/checkout/readiness');
    return {
      kind: 'loaded',
      missing: r.missing,
      defaults: r.defaults,
      production: r.production ?? { formsOnBehalf: false },
      projects: r.projects ?? [],
      passport: r.passport ?? EMPTY_PASSPORT,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { kind: 'anon' };
    return { kind: 'unreadable' };
  }
}
