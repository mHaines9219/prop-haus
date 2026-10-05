'use client';

/**
 * ProjectStatusSelect — the one control for the user's own project status
 * (projects.status: active | pending | done).
 *
 * Reads as a StatusToken that opens (DESIGN.md §9.10): the 6px tone dot, the
 * 11px mono uppercase label, a hairline pill, plus a 14px chevron so it is
 * plainly a control. Underneath it is a native <select>, so it works with a
 * keyboard, a screen reader and a phone without a menu library. Used inside
 * the Dashboard's DataTable rows (which ignore clicks on selects for the row
 * link).
 *
 * Writes through PATCH /api/projects/[id]/status { status }. Optimistic: the
 * pill flips at once, `onChange` lets the table re-filter, and a failed write
 * rolls back and shows a §9.9 error line under the control.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { postJson } from '@/lib/api';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from '@/lib/project-status';
import { TONE_DOT, projectStatusSpec } from '@/components/ap/status-token';
import { cn } from '@/lib/utils';

export function ProjectStatusSelect({
  projectId,
  value,
  label,
  onChange,
  className,
}: {
  projectId: string;
  /** The status as the server last rendered it. */
  value: ProjectStatus;
  /** Accessible name, e.g. "Status for Nocturne". */
  label: string;
  /** Fires with the new status as soon as the user picks it, and again with the old one if the write fails. */
  onChange?: (status: ProjectStatus) => void;
  className?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<ProjectStatus>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A refresh from the server wins over whatever this control last showed.
  useEffect(() => {
    setCurrent(value);
  }, [value]);

  async function pick(next: ProjectStatus) {
    if (next === current || busy) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    onChange?.(next);
    setBusy(true);
    try {
      await postJson(`/api/projects/${projectId}/status`, { status: next }, { method: 'PATCH' });
      router.refresh();
    } catch {
      setCurrent(previous);
      onChange?.(previous);
      setError('The status did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const { tone } = projectStatusSpec(current);

  return (
    <div className={cn('inline-flex flex-col items-start', className)}>
      <span
        data-busy={busy || undefined}
        className={cn(
          'relative inline-flex items-center rounded-[2px] border border-border transition-colors duration-150',
          'hover:border-border-strong has-[:focus-visible]:border-border-strong',
          'data-[busy]:opacity-60',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute left-2 h-1.5 w-1.5 rounded-full', TONE_DOT[tone])}
        />
        <select
          aria-label={label}
          value={current}
          disabled={busy}
          onChange={(e) => void pick(e.target.value as ProjectStatus)}
          // Stop the row link behind it from reading the pick as a click.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'h-[22px] appearance-none bg-transparent pl-[22px] pr-7 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-text-secondary outline-none',
            'cursor-pointer disabled:cursor-wait',
          )}
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-surface-raised text-foreground">
              {PROJECT_STATUS_LABEL[s].toUpperCase()}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={14}
          strokeWidth={1.5}
          className="pointer-events-none absolute right-2 text-text-tertiary"
        />
      </span>
      {error && (
        <p role="alert" className="mt-2 border-l-2 border-destructive pl-2 font-mono text-[11px] leading-[14px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
