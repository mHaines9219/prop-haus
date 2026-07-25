'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { Token } from '@astryxdesign/core/Token';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@astryxdesign/core/Icon';
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

  const size = large ? 'lg' : 'md';

  return (
    <form onSubmit={handleSubmit} className={large ? 'mx-auto w-full max-w-2xl' : 'w-full max-w-md'}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex items-start gap-2 rounded-lg transition ${
          dragOver ? 'ring-2 ring-accent' : ''
        }`}
      >
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
        <div className="flex-1">
          <TextInput
            label="Search props"
            isLabelHidden
            value={value}
            onChange={(v) => setValue(v)}
            size={size}
            startIcon={<Icon icon="search" />}
            hasClear
            placeholder={
              hasFiles
                ? 'Add a brief (optional)…'
                : large
                  ? 'Search: couch · blue couch · mid century · or drop a moodboard for AI'
                  : 'Search props…'
            }
          />
        </div>
        <Button
          label="Moodboard"
          variant="secondary"
          size={size}
          type="button"
          tooltip="Attach moodboard images or PDF"
          onClick={() => inputRef.current?.click()}
        />
        {large && hasFiles && (
          <div className="w-44 shrink-0">
            <Selector
              label="Vision model"
              isLabelHidden
              size={size}
              value={mode}
              options={SEARCH_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              onChange={(v) => setMode(v as SearchMode)}
            />
          </div>
        )}
        <Button label={aiActive ? 'Ask AI' : 'Search'} variant="primary" size={size} type="submit" />
      </div>

      {large && !hasFiles && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Search engine"
            size="sm"
            value={engine}
            onChange={(v) => setEngine(v as Engine)}
          >
            <SegmentedControlItem label="Keyword" value="keyword" />
            <SegmentedControlItem label="Ask AI" value="ai" />
          </SegmentedControl>
          <Text type="supporting" color="secondary">
            {engine === 'ai'
              ? 'interprets your brief · curates a set'
              : 'exact metadata matches · instant'}
          </Text>
        </div>
      )}

      {large && hasFiles && (
        <div className="mt-2">
          <Text type="supporting" color="secondary">
            {MODE_LABEL[mode]} — {MODE_HINT[mode]}
          </Text>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) =>
            f.previewUrl ? (
              <Thumbnail
                key={i}
                src={f.previewUrl}
                alt={f.file.name}
                label={f.file.name}
                onRemove={() => removeFile(i)}
              />
            ) : (
              <Token key={i} label={f.file.name} onRemove={() => removeFile(i)} />
            ),
          )}
        </div>
      )}
    </form>
  );
}
