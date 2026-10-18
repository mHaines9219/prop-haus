'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { patchJson } from '@/lib/api';
import { PROJECT_SUMMARY_MAX } from '@/lib/project-summary';
import { Textarea } from '@/components/ui/textarea';

/**
 * Job Summary — a free-text box on the project page where the user writes
 * what the job is in their own words. Edits stay on the page until Save
 * writes them through PATCH /api/projects/[id]/summary; a failed write keeps
 * the draft and shows a §9.9 error line under the box.
 */
export function JobSummary({ projectId, summary }: { projectId: string; summary: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(summary);
  const [saved, setSaved] = useState(summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = draft.trim() !== saved;

  async function save() {
    const next = draft.trim();
    if (next === saved || busy) return;
    setBusy(true);
    setError(null);
    try {
      await patchJson(`/api/projects/${projectId}/summary`, { summary: next });
      setSaved(next);
      router.refresh();
    } catch {
      setError('The summary did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="project-summary">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2
          id="project-summary"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary"
        >
          Job Summary
        </h2>
        <span className="font-mono text-[11px] leading-[14px] text-text-tertiary" aria-live="polite">
          {busy ? 'Saving' : dirty ? 'Unsaved changes' : saved ? 'Saved' : ''}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-2 border-t border-border pt-4"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What the job is, who it is for, and what matters: a two-day commercial shoot in a downtown loft, 70s apartment look, props due on set Thursday."
          rows={4}
          maxLength={PROJECT_SUMMARY_MAX}
          disabled={busy}
          aria-label="Job summary"
          aria-invalid={error ? true : undefined}
          className="min-h-24 resize-y"
        />
        <div className="flex items-center justify-between gap-3">
          {error ? (
            <p role="alert" className="font-mono text-[11px] leading-[14px] text-accent-text">
              {error}
            </p>
          ) : (
            <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              For your team. Nothing here goes to a vendor.
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !dirty}
            className="h-8 shrink-0 rounded-md border border-accent px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-accent-text transition-colors hover:bg-accent/15 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
