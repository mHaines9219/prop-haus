'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Textarea } from '@/components/ui/textarea';
import { CREW_COPY, CREW_SKILL_LABELS, formatDayRate } from '@/lib/crew';
import type { ProjectSummary } from '@/lib/projects';

export type Contractor = {
  id: string;
  name: string;
  photo: string | null;
  skills: string[];
  city: string;
  rate_low: number | null;
  rate_high: number | null;
  bio: string | null;
  category: string;
};

type Status = 'idle' | 'open' | 'submitting' | 'sent' | 'error';

export function ContractorCard({
  contractor,
  projects = [],
  initialProjectId = null,
}: {
  contractor: Contractor;
  /** The org's projects; when there are any, the form asks which one the crew is for. */
  projects?: ProjectSummary[];
  /** The project the picker starts on; falls back to the first project. */
  initialProjectId?: string | null;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [dates, setDates] = useState('');
  const [projectId, setProjectId] = useState(
    () => (initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : projects[0]?.id) ?? '',
  );
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const formOpen = status === 'open' || status === 'submitting' || status === 'error';

  /** Close the modal without sending. A request in flight keeps the modal up. */
  function close() {
    if (status === 'submitting') return;
    setStatus('idle');
    setErrorMsg('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const dateList = dates
      .split(/[\s,;]+/)
      .map((d) => d.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/crew/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractor_id: contractor.id,
          requested_dates: dateList,
          location: location || undefined,
          notes: notes || undefined,
          project_id: projectId || undefined,
        }),
      });

      if (res.status === 401) {
        // Redirect to login, preserve current page
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? 'Request failed');
      }

      setStatus('sent');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  return (
    <div className="flex w-full flex-col bg-background">
      {/* Info placard */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3">
          <ContractorAvatar name={contractor.name} photo={contractor.photo} />
          <p className="font-display text-[18px] font-bold leading-[24px]">
            {contractor.name}
          </p>
        </div>

        {/* Skill tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {contractor.skills.map((s) => (
            <span
              key={s}
              className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] uppercase leading-none tracking-[0.06em] text-text-tertiary"
            >
              {CREW_SKILL_LABELS[s] ?? s}
            </span>
          ))}
        </div>

        {/* Rate */}
        <p className="mt-3 font-mono text-[13px] leading-[18px] text-text-secondary">
          {formatDayRate(contractor.rate_low, contractor.rate_high)}
        </p>

        {/* Bio */}
        {contractor.bio && (
          <p className="mt-3 text-[14px] leading-[21px] text-text-secondary">
            {contractor.bio}
          </p>
        )}

        {/* Request controls — pinned to the bottom so every card in a row lines up */}
        <div className="mt-auto pt-5">
          {status === 'sent' ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-confirmed)]" />
              <p className="text-[13px] leading-[18px] text-text-secondary">
                Request sent — we&apos;ll be in touch.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStatus('open')}
              className="lift-sm h-9 rounded-md border border-accent px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-accent-text hover:bg-accent/15"
            >
              {CREW_COPY.ctaLabel}
            </button>
          )}
        </div>
      </div>

      <RequestModal
        open={formOpen}
        contractor={contractor}
        status={status}
        errorMsg={errorMsg}
        projects={projects}
        projectId={projectId}
        onProjectId={setProjectId}
        dates={dates}
        onDates={setDates}
        location={location}
        onLocation={setLocation}
        notes={notes}
        onNotes={setNotes}
        onClose={close}
        onSubmit={submit}
      />
    </div>
  );
}

const FIELD =
  'h-9 w-full rounded-md border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-accent focus:outline-none';
const FIELD_LABEL = 'font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary';

/**
 * The request form as a modal (DESIGN.md §9.6 shape): a cream sheet with an
 * ink rule and the hard overlay shadow, laid over a scrim that blurs the
 * directory behind it. Opening it never changes the card's size, so the grid
 * holds still. Escape and the scrim close it; a sent request closes it too.
 */
function RequestModal({
  open,
  contractor,
  status,
  errorMsg,
  projects,
  projectId,
  onProjectId,
  dates,
  onDates,
  location,
  onLocation,
  notes,
  onNotes,
  onClose,
  onSubmit,
}: {
  open: boolean;
  contractor: Contractor;
  status: Status;
  errorMsg: string;
  projects: ProjectSummary[];
  projectId: string;
  onProjectId: (v: string) => void;
  dates: string;
  onDates: (v: string) => void;
  location: string;
  onLocation: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const reduce = useReducedMotion();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const submitting = status === 'submitting';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            data-slot="backdrop"
            className="fixed inset-0 z-50 bg-scrim/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            key="modal"
            role="dialog"
            aria-modal
            aria-label={`Request ${contractor.name}`}
            initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30, duration: 0.22 }}
            className="fixed inset-x-0 top-[10vh] z-50 mx-auto w-full max-w-lg px-4"
          >
            <div className="sheet max-h-[80vh] overflow-y-auto border-[1.5px] border-ink bg-card text-foreground shadow-[var(--shadow-overlay)]">
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-ink px-5 py-4">
                <div className="min-w-0">
                  <p className="font-heading text-[10px] font-extrabold uppercase tracking-[0.12em] text-text-tertiary">
                    Crew request
                  </p>
                  <h2 className="ad-headline mt-0.5 truncate text-[24px]">{contractor.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center border border-transparent text-text-tertiary transition-colors duration-150 hover:border-ink hover:text-foreground"
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
                {projects.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className={FIELD_LABEL}>Project</span>
                    <select value={projectId} onChange={(e) => onProjectId(e.target.value)} className={FIELD}>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      <option value="">No project</option>
                    </select>
                  </label>
                )}

                <label className="flex flex-col gap-1">
                  <span className={FIELD_LABEL}>Dates needed</span>
                  <input
                    type="text"
                    value={dates}
                    onChange={(e) => onDates(e.target.value)}
                    placeholder="e.g. Sep 12, Sep 15–17"
                    autoFocus
                    className={FIELD}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={FIELD_LABEL}>Location</span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => onLocation(e.target.value)}
                    placeholder="Studio, address, or area"
                    className={FIELD}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className={FIELD_LABEL}>Notes</span>
                  <Textarea
                    value={notes}
                    onChange={(e) => onNotes(e.target.value)}
                    placeholder="Call time, scope, anything the contractor should know"
                    rows={3}
                    className="resize-none rounded-md border-border bg-surface-inset font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-accent focus:ring-border-strong"
                  />
                </label>

                {status === 'error' && errorMsg && (
                  <p className="font-mono text-[12px] text-accent-text">{errorMsg}</p>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="h-9 rounded-md border border-border px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-foreground disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-9 rounded-md bg-primary px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-50"
                  >
                    {submitting ? 'Sending…' : 'Send request'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** 48px circular headshot; falls back to initials on the plate color. */
function ContractorAvatar({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = photo && !failed;

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-card">
      {showPhoto ? (
        <Image
          src={photo}
          alt={name}
          fill
          sizes="48px"
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-plate font-mono text-[13px] font-medium text-jet"
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
