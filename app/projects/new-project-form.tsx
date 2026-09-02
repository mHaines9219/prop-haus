'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ApiError, postJson } from '@/lib/api';

/**
 * "Start a new project" — a row, not a floating button (DESIGN.md §9.7). Opens
 * inline into a single name field; the server seeds the project with its
 * "Scene 1" and "Paperwork" folders, and we land on it.
 */
export function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the production a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { id } = await postJson<{ id: string }>('/api/projects', { name: trimmed });
      router.push(`/projects/${id}`);
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
            <form onSubmit={submit} className="flex flex-col gap-2 pb-5 sm:flex-row">
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
            </form>
            {error && <p className="-mt-3 pb-4 font-mono text-[12px] text-accent-text">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
