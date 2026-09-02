'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ApiError, postJson } from '@/lib/api';

/**
 * "Start a new project" — a row, not a floating button (DESIGN.md §9.7). Opens
 * inline into a name field and an optional description. The server seeds the
 * project with its "Scene 1" and "Paperwork" folders; a description also runs
 * the first intake turn, and we land on the paperwork checklist instead of the
 * project page so the questions and the list are the first thing seen.
 */
export const DESCRIPTION_PLACEHOLDER =
  'Describe the production (optional). Try: a 10-day indie film in Brooklyn, 15 crew, renting props from three vendors, one child actor, a stunt scene.';

export function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the production a name.');
      return;
    }
    const about = description.trim();
    setBusy(true);
    setError('');
    try {
      const { id } = await postJson<{ id: string }>('/api/projects', {
        name: trimmed,
        ...(about ? { description: about } : {}),
      });
      router.push(about ? `/projects/${id}/paperwork` : `/projects/${id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setBusy(false);
      setError('Couldn’t create that project. Try again.');
    }
  }

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setError('');
        }}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 py-4 text-left transition-colors duration-150 hover:bg-surface-inset"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-border text-text-secondary">
          <Plus size={14} strokeWidth={1.5} aria-hidden />
        </span>
        <span className="text-[15px] font-medium leading-[22px] text-foreground">
          {open ? 'Cancel' : 'Start a new project'}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="new-project"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="overflow-hidden"
          >
            <form onSubmit={submit} className="flex flex-col gap-2 pb-5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production name (e.g. Nocturne S2, Ep. 4)"
                  maxLength={200}
                  autoFocus
                  className="h-9 w-full rounded-md border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="h-9 shrink-0 rounded-md border border-emerald-500 px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {busy ? 'Creating…' : 'Create project'}
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={DESCRIPTION_PLACEHOLDER}
                maxLength={4000}
                rows={3}
                disabled={busy}
                className="w-full resize-none rounded-md border border-border bg-surface-inset px-3 py-2 font-mono text-[13px] leading-[19px] text-foreground placeholder:text-text-disabled focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
              <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
                Describe it and Prop Haus drafts the paperwork checklist, then asks what it still needs to know.
              </p>
            </form>
            {error && <p className="-mt-3 pb-4 font-mono text-[12px] text-accent-text">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
