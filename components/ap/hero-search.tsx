'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AIPromptModal } from './ai-prompt-modal';

type Engine = 'keyword' | 'ai';

const ENGINE_STORAGE_KEY = 'prophaus.searchEngine';

/**
 * Nocturne search pill matching the Setlist landing template:
 * - Pill capsule (rounded-full), bg-card, border that turns accent on focus
 * - Left: magnifier + text input
 * - Right actions (flush, no border): paperclip | AI MODE (rainbow ring) | SEARCH (accent tint)
 * - Below: uppercase hint text
 *
 * The SEARCH end caps the pill with a right-rounded accent tint fill.
 * AI MODE carries a spinning conic-gradient ring via the .ai-ring CSS utility.
 */
export function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [engine, setEngine] = useState<Engine>('keyword');
  const [focused, setFocused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (saved === 'keyword' || saved === 'ai') setEngine(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ENGINE_STORAGE_KEY, engine);
  }, [engine]);

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
        {/* Pill */}
        <div
          className={cn(
            'flex items-center overflow-hidden rounded-full border bg-card transition-colors duration-150',
            focused ? 'border-accent' : 'border-border',
          )}
          style={{ minHeight: 56 }}
        >
          {/* Search field */}
          <div className="flex flex-1 items-center gap-3 pl-5 pr-3">
            {/* Magnifier icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="shrink-0 text-text-tertiary">
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
              placeholder="Search the catalogue"
              className="h-full min-w-0 flex-1 bg-transparent py-4 text-[15px] text-foreground outline-none placeholder:text-text-tertiary"
            />
          </div>

          {/* Actions — stretch to full pill height, no gap between them */}
          <div className="flex self-stretch">
            {/* Paperclip / attach */}
            <button
              type="button"
              aria-label="Attach a PDF or moodboard"
              title="Attach a PDF or moodboard"
              className="flex items-center px-4 text-text-tertiary transition-colors duration-150 hover:text-text-secondary"
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M13.6 6.2 7.9 11.9a2.1 2.1 0 0 0 3 3l6.1-6.1a3.7 3.7 0 0 0-5.2-5.2L5.4 10a5.2 5.2 0 0 0 7.4 7.4l1.4-1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* AI MODE — rainbow conic ring via .ai-ring */}
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
                'ai-ring flex items-center px-4 font-heading text-[12px] font-bold uppercase tracking-[0.06em] transition-colors duration-150',
                engine === 'ai' ? 'text-foreground' : 'text-text-secondary hover:text-foreground',
              )}
            >
              AI Mode
            </button>

            {/* SEARCH — accent tint fill, right-caps the pill; goes solid dark in light mode */}
            <button
              type="submit"
              className="search-go flex items-center rounded-r-full px-6 font-heading text-[12px] font-bold uppercase tracking-[0.06em] text-accent transition-colors duration-150"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'color-mix(in srgb, var(--color-accent) 24%, transparent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  'color-mix(in srgb, var(--color-accent) 14%, transparent)';
              }}
            >
              Search
            </button>
          </div>
        </div>

        {/* Hint */}
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Attach PDF / Moodboard — or describe it and let AI mode find it
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
