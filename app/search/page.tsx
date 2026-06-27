'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ItemCard } from '@/components/item-card';
import { SearchBar } from '@/components/search-bar';
import { getJson, postForm, postJson } from '@/lib/api';
import type { SearchMatch, SearchResponse } from '@/lib/types';

type KeywordResponse = { query: string; matches: SearchMatch[]; total: number };

function SearchInner() {
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const wantsAI = params.get('ai') === '1';

  const [query, setQuery] = useState(initialQ);
  // Which engine's results to show. Keyword is a cacheable GET query; AI is an
  // event-driven POST mutation (text body or multipart moodboard).
  const [engine, setEngine] = useState<'keyword' | 'ai'>(wantsAI ? 'ai' : 'keyword');

  const keyword = useQuery({
    queryKey: ['keyword', query],
    enabled: engine === 'keyword' && !!query,
    queryFn: () => getJson<KeywordResponse>(`/api/keyword?q=${encodeURIComponent(query)}`),
  });

  const ai = useMutation({
    mutationFn: (input: string | FormData) =>
      typeof input === 'string'
        ? postJson<SearchResponse>('/api/search', { query: input, mode: 'text' })
        : postForm<SearchResponse>('/api/search', input),
  });

  const runAI = (q: string) => {
    if (!q) return;
    setQuery(q);
    setEngine('ai');
    ai.mutate(q);
  };

  const runMultipart = (form: FormData) => {
    const q = form.get('query');
    if (typeof q === 'string') setQuery(q);
    setEngine('ai');
    ai.mutate(form);
  };

  // Initial run from the URL: AI when ?ai=1, otherwise the keyword query fires
  // automatically via `enabled`. Guarded so it only happens once on mount.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (initialQ && wantsAI) ai.mutate(initialQ);
  }, [initialQ, wantsAI, ai]);

  const loading = engine === 'ai' ? ai.isPending : keyword.isFetching;
  const error = engine === 'ai' ? ai.error : keyword.error;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-4xl">Search</h1>
        <SearchBar
          initial={initialQ}
          large
          initialEngine={wantsAI ? 'ai' : 'keyword'}
          onSubmitMultipart={runMultipart}
        />
      </div>

      {loading && (
        <p className="font-sans text-ink/60">
          {engine === 'ai' ? 'Thinking through the catalog…' : 'Searching…'}
        </p>
      )}
      {error && (
        <div className="border border-red-400 bg-red-50 p-4 font-sans text-sm">
          <p className="font-semibold">Search failed</p>
          <p className="text-ink/70 mt-1">{error.message}</p>
          {error.message.includes('OPENROUTER_API_KEY') && (
            <p className="text-ink/70 mt-2">
              Copy <code>.env.local.example</code> → <code>.env.local</code>, paste your OpenRouter key, then restart the dev server.
            </p>
          )}
        </div>
      )}
      {engine === 'keyword' && !loading && !error && keyword.data && (
        <KeywordResults data={keyword.data} onAskAI={() => runAI(query)} />
      )}
      {engine === 'ai' && !loading && !error && ai.data && <Results data={ai.data} />}
    </div>
  );
}

function KeywordResults({ data, onAskAI }: { data: KeywordResponse; onAskAI: () => void }) {
  const { matches, total, query } = data;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/15 pb-3">
        <p className="font-sans text-sm text-ink/60">
          {total === 0 ? (
            <>No metadata matches for “{query}”.</>
          ) : (
            <>
              <span className="text-ink">{total}</span> match{total === 1 ? '' : 'es'} for “{query}”
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onAskAI}
          className="font-sans text-xs uppercase tracking-widest px-4 py-2 border border-ink/30 hover:bg-ink hover:text-paper transition"
          title="Let AI interpret your query and curate a fuller set"
        >
          {total === 0 ? 'Try Ask AI →' : 'Ask AI to curate →'}
        </button>
      </div>

      {matches.length === 0 ? (
        <p className="font-sans text-ink/60">
          Nothing matched those words directly. Ask AI to interpret the brief instead.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {matches.map((m) => (
            <ItemCard key={m.item.id} item={m.item} matchedVia={m.matchedVia} />
          ))}
        </div>
      )}
    </>
  );
}

function Results({ data }: { data: SearchResponse }) {
  const { interpretation, matches, explanation, modelsUsed, mode } = data;
  return (
    <>
      {interpretation && (
        <div className="border border-ink/20 bg-ink/[0.03] p-4 space-y-3">
          <p className="font-sans text-[10px] uppercase tracking-widest text-ink/50">
            AI read your moodboard
          </p>
          {interpretation.overall.summary && (
            <p className="font-display text-xl leading-snug">{interpretation.overall.summary}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[
              ...interpretation.overall.style.map((s) => ({ k: 'style', v: s })),
              ...(interpretation.overall.era ? [{ k: 'era', v: interpretation.overall.era }] : []),
              ...interpretation.overall.vibes.map((s) => ({ k: 'vibe', v: s })),
              ...(interpretation.overall.settingType ?? []).map((s) => ({ k: 'setting', v: s })),
            ].map((t, i) => (
              <span
                key={i}
                className="font-sans text-[10px] uppercase tracking-widest px-2 py-0.5 border border-ink/20"
              >
                {t.v}
              </span>
            ))}
          </div>
          {interpretation.detectedItems.length > 0 && (
            <div>
              <p className="font-sans text-[10px] uppercase tracking-widest text-ink/50 mb-1">
                Detected items
              </p>
              <div className="flex flex-wrap gap-1.5">
                {interpretation.detectedItems.map((d, i) => (
                  <span
                    key={i}
                    className="font-sans text-xs px-2 py-1 bg-paper border border-ink/20"
                    title={d.description}
                  >
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {interpretation.suggestedAdditions.length > 0 && (
            <div>
              <p className="font-sans text-[10px] uppercase tracking-widest text-ink/50 mb-1">
                Tasteful additions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {interpretation.suggestedAdditions.map((a, i) => (
                  <span
                    key={i}
                    className="font-sans text-xs px-2 py-1 bg-paper border border-ink/20"
                    title={a.reason}
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {explanation && !interpretation && (
        <p className="font-sans text-sm text-ink/70 italic">{explanation}</p>
      )}

      {matches.length === 0 ? (
        <p className="font-sans text-ink/60">No matches. Try a different phrasing or attach a moodboard.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {matches.map((m) => (
            <ItemCard key={m.item.id} item={m.item} matchedVia={m.matchedVia} />
          ))}
        </div>
      )}

      <p className="font-sans text-[10px] uppercase tracking-widest text-ink/40">
        mode: {mode}{modelsUsed.length ? ` · via ${modelsUsed.join(' + ')}` : ''}
      </p>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="font-sans text-ink/60">Loading…</p>}>
      <SearchInner />
    </Suspense>
  );
}
