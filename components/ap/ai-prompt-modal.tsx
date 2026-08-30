'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type AIPromptResult = { inspiration: string; budget: number | null };

export function AIPromptModal({
  open,
  initialInspiration,
  onSubmit,
  onClose,
}: {
  open: boolean;
  initialInspiration?: string;
  onSubmit: (result: AIPromptResult) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [inspiration, setInspiration] = useState(initialInspiration ?? '');
  const [budget, setBudget] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync initialInspiration when modal opens.
  useEffect(() => {
    if (open) {
      setInspiration(initialInspiration ?? '');
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, initialInspiration]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inspiration.trim();
    if (!trimmed) return;
    const parsedBudget = budget ? parseFloat(budget.replace(/[^0-9.]/g, '')) : null;
    onSubmit({ inspiration: trimmed, budget: parsedBudget && !isNaN(parsedBudget) ? parsedBudget : null });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          {/* Modal */}
          <motion.div
            key="modal"
            role="dialog"
            aria-modal
            aria-label="AI set curation"
            initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30, duration: 0.22 }}
            className="fixed inset-x-0 top-[15vh] z-50 mx-auto w-full max-w-lg px-4"
          >
            <div className="rounded-[14px] border border-border bg-card shadow-lg">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
                    AI Mode
                  </p>
                  <h2 className="font-heading text-[20px] font-bold leading-tight text-foreground">
                    Curate a set
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-sm text-text-tertiary transition-colors duration-150 hover:text-foreground"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5 p-5">
                {/* Inspiration */}
                <div className="space-y-2">
                  <label
                    htmlFor="ai-inspiration"
                    className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary"
                  >
                    Inspiration
                  </label>
                  <textarea
                    ref={textareaRef}
                    id="ai-inspiration"
                    value={inspiration}
                    onChange={(e) => setInspiration(e.target.value)}
                    placeholder="70s bachelor apartment. Warm, wood-heavy. Think Boogie Nights."
                    rows={4}
                    className={cn(
                      'w-full resize-none rounded-md border border-border bg-card px-3 py-2.5',
                      'font-mono text-[14px] leading-relaxed text-foreground outline-none',
                      'placeholder:text-text-tertiary',
                      'transition-colors duration-150 focus:border-accent',
                    )}
                  />
                  <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
                    Describe a scene, mood, era, or aesthetic. The more specific, the better.
                  </p>
                </div>

                {/* Budget */}
                <div className="space-y-2">
                  <label
                    htmlFor="ai-budget"
                    className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary"
                  >
                    Budget <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <div className="flex items-center rounded-md border border-border bg-card transition-colors duration-150 focus-within:border-accent">
                    <span className="pl-3 font-mono text-[14px] text-text-tertiary select-none">$</span>
                    <input
                      id="ai-budget"
                      type="text"
                      inputMode="decimal"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="2,500"
                      className="h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-[14px] text-foreground outline-none placeholder:text-text-tertiary"
                    />
                  </div>
                  <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
                    AI will prioritize items that fit within your production budget.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-9 rounded-md border border-border px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-foreground transition-colors duration-150 hover:bg-foreground/7"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!inspiration.trim()}
                    className="h-9 rounded-md border border-accent px-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-accent transition-colors duration-150 hover:bg-accent/12 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Curate my set
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
