'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
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
    <div className="flex flex-col bg-background">
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

        {/* Request controls */}
        <div className="mt-5">
          {status === 'sent' ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-confirmed)]" />
              <p className="text-[13px] leading-[18px] text-text-secondary">
                Request sent — we&apos;ll be in touch.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStatus(formOpen ? 'idle' : 'open')}
                className={cn(
                  'h-9 rounded-md border px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] transition-colors duration-150',
                  formOpen
                    ? 'border-border text-text-tertiary hover:text-foreground'
                    : 'border-accent text-accent-text hover:bg-accent/15',
                )}
              >
                {formOpen ? 'Cancel' : CREW_COPY.ctaLabel}
              </button>

              <AnimatePresence initial={false}>
                {formOpen && (
                  <motion.form
                    key="form"
                    onSubmit={submit}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-3 pt-4">
                      {projects.length > 0 && (
                        <label className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                            Project
                          </span>
                          <select
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground focus:border-accent focus:outline-none"
                          >
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
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                          Dates needed
                        </span>
                        <input
                          type="text"
                          value={dates}
                          onChange={(e) => setDates(e.target.value)}
                          placeholder="e.g. Sep 12, Sep 15–17"
                          className="h-9 w-full rounded-md border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-accent focus:outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                          Location
                        </span>
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="Studio, address, or area"
                          className="h-9 w-full rounded-md border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-accent focus:outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                          Notes
                        </span>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Call time, scope, anything the contractor should know"
                          rows={3}
                          className="resize-none rounded-md border-border bg-surface-inset font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-accent focus:ring-border-strong"
                        />
                      </label>

                      {status === 'error' && errorMsg && (
                        <p className="font-mono text-[12px] text-accent-text">{errorMsg}</p>
                      )}

                      <button
                        type="submit"
                        disabled={status === 'submitting'}
                        className="h-9 rounded-md border border-accent px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-accent-text transition-colors hover:bg-accent/15 disabled:opacity-50"
                      >
                        {status === 'submitting' ? 'Sending…' : 'Send request'}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </div>
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
          className="absolute inset-0 grid place-items-center bg-plate font-mono text-[13px] font-medium text-ink"
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
