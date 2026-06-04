'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ItemCard } from '@/components/item-card';
import { SearchBar } from '@/components/search-bar';
import type { SearchResponse } from '@/lib/types';

function SearchInner() {
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ok'; data: SearchResponse }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const runText = useCallback((q: string, mode: string) => {
    if (!q) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q, mode }),
    })
      .then(async (r) => {
        const data = (await r.json()) as SearchResponse;
        if (!r.ok || data.error) setState({ status: 'error', message: data.error || `HTTP ${r.status}` });
        else setState({ status: 'ok', data });
      })
      .catch((e: unknown) => setState({ status: 'error', message: (e as Error).message }));
  }, []);

  const runMultipart = useCallback((form: FormData) => {
    setState({ status: 'loading' });
    fetch('/api/search', { method: 'POST', body: form })
      .then(async (r) => {
        const data = (await r.json()) as SearchResponse;
        if (!r.ok || data.error) setState({ status: 'error', message: data.error || `HTTP ${r.status}` });
        else setState({ status: 'ok', data });
      })
      .catch((e: unknown) => setState({ status: 'error', message: (e as Error).message }));
  }, []);

  // Initial run from URL query
  useEffect(() => {
    runText(initialQ, params.get('mode') ?? 'text');
  }, [initialQ, params, runText]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-4xl">AI Search</h1>
        <SearchBar initial={initialQ} large onSubmitMultipart={runMultipart} />
      </div>

      {state.status === 'loading' && (
        <p className="font-sans text-ink/60">Thinking through the catalog…</p>
      )}
      {state.status === 'error' && (
        <div className="border border-red-400 bg-red-50 p-4 font-sans text-sm">
          <p className="font-semibold">Search failed</p>
          <p className="text-ink/70 mt-1">{state.message}</p>
          {state.message.includes('OPENROUTER_API_KEY') && (
            <p className="text-ink/70 mt-2">
              Copy <code>.env.local.example</code> → <code>.env.local</code>, paste your OpenRouter key, then restart the dev server.
            </p>
          )}
        </div>
      )}
      {state.status === 'ok' && <Results data={state.data} />}
    </div>
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
