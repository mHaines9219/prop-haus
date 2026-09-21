'use client';

/**
 * A project's CREW section: one row per crew request. Collapsed, a row is a
 * one-line text summary (name, status, dates, location). Clicking it expands
 * the row into the contractor's full profile (photo in a LightWell, skills,
 * day rate, city, bio) plus the request itself (dates, location, notes, when
 * it went out). Hairline-ruled rows like the scene list above it; the toggle
 * is a real button so it reads to a screen reader as expandable.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LightWell } from '@/components/ap/light-well';
import { StatusToken, crewStatusSpec } from '@/components/ap/status-token';
import { CREW_SKILL_LABELS, formatCrewCity, formatDayRate } from '@/lib/crew';
import type { CrewRequestRow } from '@/lib/jobs';
import { cn } from '@/lib/utils';

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function datesCopy(dates: string[]): string {
  return dates.length > 0 ? dates.map(formatDate).join(', ') : 'Dates on request';
}

export function CrewList({ crew }: { crew: CrewRequestRow[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ul className="border-t border-border">
      {crew.map((row) => (
        <CrewRow key={row.id} row={row} expanded={open.has(row.id)} onToggle={() => toggle(row.id)} />
      ))}
    </ul>
  );
}

function CrewRow({ row, expanded, onToggle }: { row: CrewRequestRow; expanded: boolean; onToggle: () => void }) {
  const detailsId = `crew-${row.id}-details`;
  const summary = [datesCopy(row.requestedDates), row.location].filter(Boolean).join(' · ');

  return (
    <li className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className={cn(
          'flex min-h-[56px] w-full items-center gap-4 py-3 text-left transition-colors duration-150 hover:bg-surface-inset',
          expanded && 'bg-surface-inset',
        )}
      >
        {/* Phrasing content only inside a button: spans, not paragraphs. */}
        <span className="block min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-3">
            <span className="truncate text-[15px] font-medium leading-[22px] text-foreground">{row.contractorName}</span>
            <StatusToken {...crewStatusSpec(row.status)} />
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] leading-[14px] text-text-tertiary">{summary}</span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn('shrink-0 text-text-tertiary transition-transform duration-150', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div id={detailsId} className="grid gap-6 pb-6 pt-2 sm:grid-cols-[160px_1fr]">
          {/* Every photo renders inside a LightWell (DESIGN.md §4); the plate shows the name when there is none. */}
          <div className="w-[160px]">
            <LightWell
              src={row.contractorPhoto ?? undefined}
              alt={row.contractorName}
              mode="photo"
              name={row.contractorName}
              sizes="160px"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="font-display text-[18px] font-bold leading-[24px] text-foreground">{row.contractorName}</p>
              <p className="font-mono text-[13px] leading-[18px] text-text-secondary">
                {formatDayRate(row.contractorRateLow, row.contractorRateHigh)}
              </p>
              {formatCrewCity(row.contractorCity) && (
                <p className="font-mono text-[13px] leading-[18px] text-text-tertiary">
                  {formatCrewCity(row.contractorCity)}
                </p>
              )}
            </div>

            {row.contractorSkills.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
                {row.contractorSkills.map((s) => (
                  <li
                    key={s}
                    className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] uppercase leading-none tracking-[0.06em] text-text-tertiary"
                  >
                    {CREW_SKILL_LABELS[s] ?? s}
                  </li>
                ))}
              </ul>
            )}

            {row.contractorBio && (
              <p className="mt-3 max-w-[560px] text-[14px] leading-[21px] text-text-secondary">{row.contractorBio}</p>
            )}

            <dl className="mt-5 grid gap-x-8 gap-y-3 font-mono text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Dates</dt>
                <dd className="mt-1 text-foreground">{datesCopy(row.requestedDates)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Location</dt>
                <dd className="mt-1 text-foreground">{row.location ?? 'Not given'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Requested</dt>
                <dd className="mt-1 text-foreground">{formatDate(row.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Status</dt>
                <dd className="mt-1">
                  <StatusToken {...crewStatusSpec(row.status)} />
                </dd>
              </div>
              {row.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Notes</dt>
                  <dd className="mt-1 whitespace-pre-line text-foreground">{row.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </li>
  );
}
