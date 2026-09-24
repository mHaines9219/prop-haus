'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AIPromptModal } from './ai-prompt-modal';

type Engine = 'keyword' | 'ai';

const ENGINE_STORAGE_KEY = 'prophaus.searchEngine';

/**
 * Party Line search bar (DESIGN.md §9.2): a ruled listing box, not a pill.
 * - Ink rule around a cream field; the rule turns coral on focus
 * - Left: magnifier + text input
 * - Right, separated by ink rules: attach | AI MODE (a tab that fills coral
 *   when armed) | SEARCH, the coral phone-number block that caps the bar
 * - Below: a listing-line hint
 */
export function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [engine, setEngine] = useState<Engine>('keyword');
  const [focused, setFocused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (saved === 'keyword' || saved === 'ai') setEngine(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ENGINE_STORAGE_KEY, engine);
  }, [engine]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    if (engine === 'ai') {
      setModalOpen(true);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleAISubmit({ inspiration, budget }: { inspiration: string; budget: number | null }) {
    setModalOpen(false);
    const params = new URLSearchParams({ q: inspiration, ai: '1' });
    if (budget) params.set('budget', String(budget));
    router.push(`/search?${params.toString()}`);
  }

  return (
    <>
      <form onSubmit={handleSubmit} role="search">
        <div
          data-slot="search-bar"
          className={cn(
            'flex items-stretch border-[2px] bg-plate-lit transition-colors duration-150',
            focused ? 'border-accent' : 'border-ink',
          )}
          style={{ minHeight: 56 }}
        >
          {/* Search field */}
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 pr-2 sm:gap-3 sm:pl-4 sm:pr-3">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="shrink-0 text-ink/70">
              <circle cx="7" cy="7" r="4.75" />
              <path d="M10.5 10.5 L14 14" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Search the catalogue"
              placeholder={compact ? 'Search' : 'Search the catalogue'}
              className="h-full min-w-0 flex-1 bg-transparent py-4 text-[16px] text-ink outline-none placeholder:text-ink/50"
            />
          </div>

          {/* Actions: stretch to full height, ruled apart */}
          <div className="flex shrink-0 items-stretch">
            <button
              type="button"
              aria-label="Attach a PDF or moodboard"
              title="Attach a PDF or moodboard"
              className="hidden items-center border-l-[1.5px] border-ink/40 px-3.5 text-ink/60 transition-colors duration-150 hover:bg-paper-deep hover:text-ink sm:flex"
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M13.6 6.2 7.9 11.9a2.1 2.1 0 0 0 3 3l6.1-6.1a3.7 3.7 0 0 0-5.2-5.2L5.4 10a5.2 5.2 0 0 0 7.4 7.4l1.4-1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* AI MODE: a tab, coral-filled when armed */}
            <button
              type="button"
              aria-pressed={engine === 'ai'}
              onClick={() => {
                if (engine === 'ai') {
                  setEngine('keyword');
                } else {
                  setEngine('ai');
                  setModalOpen(true);
                }
              }}
              className={cn(
                'flex items-center border-l-[1.5px] border-ink/40 px-2.5 font-heading text-[12px] font-extrabold uppercase tracking-[0.06em] transition-colors duration-150 sm:px-3.5',
                engine === 'ai'
                  ? 'bg-coral-lit text-ink'
                  : 'text-ink/70 hover:bg-paper-deep hover:text-ink',
              )}
            >
              AI Mode
            </button>

            {/* SEARCH: the coral block */}
            <button
              type="submit"
              className="search-go flex items-center border-l-[2px] border-ink bg-accent px-3 font-heading text-[13px] font-extrabold uppercase tracking-[0.06em] text-accent-foreground transition-colors duration-150 hover:bg-primary-hover sm:px-6"
            >
              Search
            </button>
          </div>
        </div>

        {/* Hint */}
        <p className="listing mt-3">
          <span>Attach a PDF or moodboard</span>
          <span>Or describe it and let AI mode find it</span>
        </p>
      </form>

      <AIPromptModal
        open={modalOpen}
        initialInspiration={value}
        onSubmit={handleAISubmit}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
