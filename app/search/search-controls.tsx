'use client';

import { ImagePlus, Search, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SEARCH_MODES, type SearchMode } from '@/lib/types';
import { cn } from '@/lib/utils';

type Engine = 'keyword' | 'ai';
type StagedFile = { file: File; previewUrl?: string };

// Shared with the hero and legacy bars so the preference survives migration.
const ENGINE_STORAGE_KEY = 'prophaus.searchEngine';
const MODE_STORAGE_KEY = 'prophaus.searchMode';

const MODE_LABEL: Record<SearchMode, string> = {
  text: 'Text',
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  'haiku-then-sonnet': 'Haiku + Sonnet',
};
const MODE_HINT: Record<SearchMode, string> = {
  text: 'no moodboard',
  haiku: 'fast vision',
  sonnet: 'better vision',
  'haiku-then-sonnet': 'highest fidelity',
};

/**
 * The search bar on the results page (DESIGN.md sections 9.2, 9.3): the hero
 * object restyled for the working surface. A mono placeholder, a tally-signaled
 * Ask AI chip (red means the live engine is armed), and a moodboard attach that
 * routes to vision search. Text submits navigate through the parent; moodboard
 * submits hand FormData up so files survive without a route change.
 */
export function SearchControls({
  initialQuery,
  initialEngine,
  onText,
  onMultipart,
}: {
  initialQuery: string;
  initialEngine: Engine;
  onText: (query: string, engine: Engine) => void;
  onMultipart: (form: FormData) => void;
}) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(initialQuery);
  const [engine, setEngine] = useState<Engine>(initialEngine);
  const [mode, setMode] = useState<SearchMode>('haiku');
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (savedMode && (SEARCH_MODES as readonly string[]).includes(savedMode)) {
      setMode(savedMode as SearchMode);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ENGINE_STORAGE_KEY, engine);
  }, [engine]);
  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  // Object URLs for image previews are revoked on unmount to avoid leaks.
  useEffect(() => {
    return () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
  }, [files]);

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    setFiles((prev) => {
      const next = [...prev];
      for (const file of arr) {
        if (next.length >= 6) break;
        const isImage = file.type.startsWith('image/');
        next.push({ file, previewUrl: isImage ? URL.createObjectURL(file) : undefined });
      }
      return next;
    });
    if (mode === 'text' && arr.length > 0) setMode('haiku');
  }

  function removeFile(i: number) {
    setFiles((prev) => {
      const f = prev[i];
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q && files.length === 0) return;

    // Moodboard files always route to vision search; they can't survive a route
    // change, so they go straight up as FormData.
    if (files.length > 0) {
      const fd = new FormData();
      if (q) fd.append('query', q);
      fd.append('mode', mode);
      files.forEach((f) => fd.append('files', f.file));
      onMultipart(fd);
      return;
    }

    onText(q, engine);
  }

  const hasFiles = files.length > 0;

  return (
    <form onSubmit={handleSubmit}>
      <motion.div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        animate={reduce ? undefined : { scale: focused ? 1.005 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn(
          'flex h-14 items-center gap-2 rounded-sm border bg-surface-inset pl-4 pr-2 transition-colors duration-150',
          focused || dragOver ? 'border-border-strong' : 'border-border',
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
          placeholder={
            hasFiles ? 'Add a brief (optional).' : 'Describe the scene. Try 70s bachelor apartment.'
          }
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[15px] text-foreground outline-none placeholder:text-text-tertiary"
        />

        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
          ref={fileInputRef}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a moodboard"
          className="hidden h-9 shrink-0 items-center gap-1.5 rounded-sm border border-border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors duration-150 hover:border-border-strong hover:text-text-secondary sm:flex"
        >
          <ImagePlus size={16} strokeWidth={1.5} aria-hidden />
          Moodboard
        </button>

        {!hasFiles && (
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
        )}

        <button
          type="submit"
          className="h-10 shrink-0 rounded-sm bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover active:scale-[0.98]"
        >
          {hasFiles || engine === 'ai' ? 'Ask AI' : 'Search'}
        </button>
      </motion.div>

      {hasFiles ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {SEARCH_MODES.filter((m) => m !== 'text').map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'h-8 rounded-sm border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-150',
                  mode === m
                    ? 'border-accent text-accent-text'
                    : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary',
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
            <span className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              {MODE_HINT[mode]}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface-inset py-1 pl-1 pr-2"
              >
                {f.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.previewUrl} alt={f.file.name} className="h-8 w-8 object-cover" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center bg-background font-mono text-[9px] text-text-tertiary">
                    PDF
                  </span>
                )}
                <span className="max-w-[140px] truncate font-mono text-[11px] text-text-secondary">
                  {f.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.file.name}`}
                  className="text-text-tertiary transition-colors duration-150 hover:text-foreground"
                >
                  <X size={14} strokeWidth={1.5} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-[19px] text-text-tertiary">
          {engine === 'ai'
            ? 'Interprets your brief and curates a set.'
            : 'Exact metadata matches, instant. Attach a moodboard for vision search.'}
        </p>
      )}
    </form>
  );
}
