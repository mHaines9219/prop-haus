'use client';

/**
 * JobStatusSelect — the one control for the user's own job status
 * (orders.job_status: active | pending | done).
 *
 * Reads as a StatusToken that opens (DESIGN.md §9.10): the 6px tone dot, the
 * 11px mono uppercase label, a hairline pill, plus a 14px chevron so it is
 * plainly a control. Underneath it is a native <select>, so it works with a
 * keyboard, a screen reader and a phone without a menu library. Used inside
 * DataTable rows (which ignore clicks on selects for the row link) and on the
 * job detail header.
 *
 * Writes through PATCH /api/orders/[id]/status { jobStatus }. Optimistic: the
 * pill flips at once, `onChange` lets a list re-filter, and a failed write
 * rolls back and shows a §9.9 error line under the control.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { postJson } from '@/lib/api';
import { JOB_STATUSES, JOB_STATUS_LABEL, type JobStatus } from '@/lib/job-status';
import { TONE_DOT, jobStatusSpec } from '@/components/ap/status-token';
import { cn } from '@/lib/utils';

export function JobStatusSelect({
  orderId,
  value,
  label,
  onChange,
  className,
}: {
  orderId: string;
  /** The status as the server last rendered it. */
  value: JobStatus;
  /** Accessible name, e.g. "Status for order #ABCDEF12". */
  label: string;
  /** Fires with the new status as soon as the user picks it, and again with the old one if the write fails. */
  onChange?: (status: JobStatus) => void;
  className?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<JobStatus>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A refresh from the server wins over whatever this control last showed.
  useEffect(() => {
    setCurrent(value);
  }, [value]);

  async function pick(next: JobStatus) {
    if (next === current || busy) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    onChange?.(next);
    setBusy(true);
    try {
      await postJson(`/api/orders/${orderId}/status`, { jobStatus: next }, { method: 'PATCH' });
      router.refresh();
    } catch {
      setCurrent(previous);
      onChange?.(previous);
      setError('The status did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const { tone } = jobStatusSpec(current);

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
          onChange={(e) => void pick(e.target.value as JobStatus)}
          // Stop the row link and any drawer behind it from reading the pick as a click.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'h-[22px] appearance-none bg-transparent pl-[22px] pr-7 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-text-secondary outline-none',
            'cursor-pointer disabled:cursor-wait',
          )}
        >
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-surface-raised text-foreground">
              {JOB_STATUS_LABEL[s].toUpperCase()}
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
