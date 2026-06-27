'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SEARCH_MODES, type SearchMode } from '@/lib/types';

type StagedFile = { file: File; previewUrl?: string };

const MODE_LABEL: Record<SearchMode, string> = {
  text: 'Text only',
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  'haiku-then-sonnet': 'Haiku + Sonnet',
};
const MODE_HINT: Record<SearchMode, string> = {
  text: 'cheapest · no moodboard',
  haiku: 'fast vision · ~$0.02',
  sonnet: 'better vision · ~$0.10',
  'haiku-then-sonnet': 'highest fidelity · ~$0.25',
};

const MODE_STORAGE_KEY = 'prophaus.searchMode';
const ENGINE_STORAGE_KEY = 'prophaus.searchEngine';

type Engine = 'keyword' | 'ai';

export function SearchBar({
  initial = '',
  large = false,
  initialEngine,
  onSubmitMultipart,
}: {
  initial?: string;
  large?: boolean;
  /** Reflect the active engine when landing on a results page (?ai=1 → 'ai'). */
  initialEngine?: Engine;
  /**
   * If provided, the bar submits FormData here instead of navigating to /search?q=.
   * The search page passes this so it can drive its own state from the same input.
   */
  onSubmitMultipart?: (form: FormData) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [mode, setMode] = useState<SearchMode>('haiku');
  const [engine, setEngine] = useState<Engine>(initialEngine ?? 'keyword');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(MODE_STORAGE_KEY) : null;
    if (saved && (SEARCH_MODES as readonly string[]).includes(saved)) setMode(saved as SearchMode);
  }, []);

  useEffect(() => {
    if (initialEngine) return; // explicit prop wins over saved preference
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(ENGINE_STORAGE_KEY) : null;
    if (saved === 'keyword' || saved === 'ai') setEngine(saved);
  }, [initialEngine]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(ENGINE_STORAGE_KEY, engine);
  }, [engine]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    return () => {
      files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    };
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
    // If user attached files in text mode, bump to a vision mode.
    if (mode === 'text' && arr.length > 0) setMode('haiku');
  }

  function removeFile(i: number) {
    setFiles((prev) => {
      const f = prev[i];
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q && files.length === 0) return;

    // Moodboard files → AI/vision search.
    if (files.length > 0) {
      const fd = new FormData();
      if (q) fd.append('query', q);
      fd.append('mode', mode);
      files.forEach((f) => fd.append('files', f.file));
      if (onSubmitMultipart) {
        onSubmitMultipart(fd);
        return;
      }
      // Files can't survive a route change without state; fall back to the query.
      router.push(`/search?q=${encodeURIComponent(q)}&mode=${mode}`);
      return;
    }

    // Text-only → engine decides: instant keyword/metadata vs AI curation.
    if (engine === 'ai') {
      router.push(`/search?q=${encodeURIComponent(q)}&ai=1`);
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  const hasFiles = files.length > 0;
  const aiActive = hasFiles || engine === 'ai';

  return (
    <form onSubmit={handleSubmit} className={large ? 'w-full max-w-2xl mx-auto' : 'w-full max-w-md'}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex border bg-paper transition ${
          dragOver ? 'border-accent ring-2 ring-accent/40' : 'border-ink/30 focus-within:border-ink'
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Attach moodboard images or PDF"
          className={`px-3 ${large ? 'text-lg' : 'text-sm'} text-ink/60 hover:text-ink transition border-r border-ink/15`}
          aria-label="Attach files"
        >
          📎
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            hasFiles
              ? 'Add a brief (optional)…'
              : large
                ? 'Search: couch · blue couch · mid century · or drop a moodboard for AI'
                : 'Search props…'
          }
          className={`flex-1 bg-transparent outline-none px-3 ${large ? 'py-4 text-lg' : 'py-2 text-sm'} font-sans`}
        />
        {large && hasFiles && (
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as SearchMode)}
            title={MODE_HINT[mode]}
            className="font-sans text-xs uppercase tracking-widest bg-paper border-l border-ink/15 px-3 outline-none cursor-pointer hover:bg-ink/5"
          >
            {SEARCH_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className={`font-sans uppercase tracking-widest ${large ? 'px-6 text-sm' : 'px-4 text-xs'} bg-ink text-paper hover:bg-accent transition`}
        >
          {aiActive ? 'Ask AI' : 'Search'}
        </button>
      </div>

      {large && !hasFiles && (
        <div className="mt-2 flex items-center gap-3 pl-1">
          <div
            role="radiogroup"
            aria-label="Search engine"
            className="inline-flex border border-ink/20 bg-paper"
          >
            <button
              type="button"
              role="radio"
              aria-checked={engine === 'keyword'}
              onClick={() => setEngine('keyword')}
              className={`font-sans text-[10px] uppercase tracking-widest px-3 py-1 transition ${
                engine === 'keyword' ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink'
              }`}
            >
              Keyword
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={engine === 'ai'}
              onClick={() => setEngine('ai')}
              className={`font-sans text-[10px] uppercase tracking-widest px-3 py-1 transition border-l border-ink/20 ${
                engine === 'ai' ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink'
              }`}
            >
              Ask AI
            </button>
          </div>
          <p className="font-sans text-[10px] uppercase tracking-widest text-ink/40">
            {engine === 'ai'
              ? 'interprets your brief · curates a set'
              : 'exact metadata matches · instant'}
          </p>
        </div>
      )}

      {large && hasFiles && (
        <p className="font-sans text-[10px] uppercase tracking-widest text-ink/40 mt-1.5 pl-1">
          {MODE_LABEL[mode]} — {MODE_HINT[mode]}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border border-ink/20 bg-paper pl-1 pr-2 py-1 font-sans text-xs"
            >
              {f.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.previewUrl} alt="" className="w-8 h-8 object-cover" />
              ) : (
                <span className="w-8 h-8 grid place-items-center bg-ink/10 text-[10px] uppercase tracking-widest">
                  PDF
                </span>
              )}
              <span className="max-w-[12rem] truncate">{f.file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.file.name}`}
                className="text-ink/40 hover:text-ink"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
