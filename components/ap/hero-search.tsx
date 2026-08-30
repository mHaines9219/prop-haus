'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Engine = 'keyword' | 'ai';

// Shared with the legacy search bar so the preference survives migration.
const ENGINE_STORAGE_KEY = 'prophaus.searchEngine';

/**
 * The hero object (DESIGN.md section 9.2): a 56px search bar on surface-inset
 * with a mono placeholder. The ASK AI chip is a tally signal: red means the
 * live engine is armed, so the submit beam reads "Ask AI".
 *
 * Adapted from KokonutUI ai-input-search (toggle-chip pattern), restyled to
 * the Answer Print language and wired to the existing /search contract.
 */
export function HeroSearch() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [value, setValue] = useState('');
  const [engine, setEngine] = useState<Engine>('keyword');
  const [focused, setFocused] = useState(false);

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
    router.push(`/search?q=${encodeURIComponent(q)}${engine === 'ai' ? '&ai=1' : ''}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <motion.div
        animate={reduce ? undefined : { scale: focused ? 1.01 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn(
          'flex h-14 items-center gap-2 rounded-sm border bg-surface-inset pl-4 pr-2 transition-colors duration-150',
          focused ? 'border-border-strong' : 'border-border',
        )}
      >
        <Search size={20} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-tertiary" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Search props"
          placeholder="Describe the scene. Try 70s bachelor apartment."
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[15px] text-foreground outline-none placeholder:text-text-tertiary"
        />
        <button
          type="button"
          aria-pressed={engine === 'ai'}
          onClick={() => setEngine(engine === 'ai' ? 'keyword' : 'ai')}
          className={cn(
            'hidden h-9 shrink-0 items-center rounded-sm border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 sm:flex',
            engine === 'ai'
              ? 'border-accent text-accent-text'
              : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary',
          )}
        >
          Ask AI
        </button>
        <button
          type="submit"
          className="h-10 shrink-0 rounded-sm bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover active:scale-[0.98]"
        >
          {engine === 'ai' ? 'Ask AI' : 'Search'}
        </button>
      </motion.div>
      <p className="mt-3 text-[13px] leading-[19px] text-text-tertiary">
        {engine === 'ai'
          ? 'Interprets your brief and curates a set.'
          : 'Exact metadata matches, instant.'}
      </p>
    </form>
  );
}
