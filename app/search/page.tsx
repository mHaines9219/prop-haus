'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Token } from '@astryxdesign/core/Token';
import { ItemCard } from '@/components/item-card';
import { SearchBar } from '@/components/search-bar';
import { getJson, postForm, postJson } from '@/lib/api';
import type { CardItem, SearchResponse } from '@/lib/types';

// Both the keyword endpoint (card-projected items) and the AI endpoint (full
// PropItems, which are assignable to CardItem) feed ResultGrid.
type CardMatch = { item: CardItem; matchedVia: string[]; score: number };
type KeywordResponse = { query: string; matches: CardMatch[]; total: number };

function ResultGrid({ matches }: { matches: CardMatch[] }) {
  return (
    <Grid columns={{ minWidth: 200 }} gap={5}>
      {matches.map((m) => (
        <ItemCard key={m.item.id} item={m.item} matchedVia={m.matchedVia} />
      ))}
    </Grid>
  );
}

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
        <Heading level={1}>Search</Heading>
        <SearchBar
          initial={initialQ}
          large
          initialEngine={wantsAI ? 'ai' : 'keyword'}
          onSubmitMultipart={runMultipart}
        />
      </div>

      {loading && (
        <Text color="secondary">
          {engine === 'ai' ? 'Thinking through the catalog…' : 'Searching…'}
        </Text>
      )}
      {error && (
        <Banner status="error" title="Search failed" description={error.message}>
          {error.message.includes('OPENROUTER_API_KEY') && (
            <Text type="supporting" color="secondary">
              Copy .env.local.example → .env.local, paste your OpenRouter key, then restart the dev
              server.
            </Text>
          )}
        </Banner>
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
        <Text color="secondary">
          {total === 0
            ? `No metadata matches for “${query}”.`
            : `${total} match${total === 1 ? '' : 'es'} for “${query}”`}
        </Text>
        <Button
          label={total === 0 ? 'Try Ask AI →' : 'Ask AI to curate →'}
          variant="secondary"
          size="sm"
          tooltip="Let AI interpret your query and curate a fuller set"
          onClick={onAskAI}
        />
      </div>

      {matches.length === 0 ? (
        <Text color="secondary">
          Nothing matched those words directly. Ask AI to interpret the brief instead.
        </Text>
      ) : (
        <ResultGrid matches={matches} />
      )}
    </>
  );
}

function Results({ data }: { data: SearchResponse }) {
  const { interpretation, matches, explanation, modelsUsed, mode } = data;
  return (
    <>
      {interpretation && (
        <Card>
          <div className="space-y-3">
            <Text type="label" color="secondary">
              AI read your moodboard
            </Text>
            {interpretation.overall.summary && (
              <Heading level={3}>{interpretation.overall.summary}</Heading>
            )}
            <div className="flex flex-wrap gap-1.5">
              {[
                ...interpretation.overall.style.map((s) => ({ k: 'style', v: s })),
                ...(interpretation.overall.era ? [{ k: 'era', v: interpretation.overall.era }] : []),
                ...interpretation.overall.vibes.map((s) => ({ k: 'vibe', v: s })),
                ...(interpretation.overall.settingType ?? []).map((s) => ({ k: 'setting', v: s })),
              ].map((t, i) => (
                <Token key={i} size="sm" label={t.v} />
              ))}
            </div>
            {interpretation.detectedItems.length > 0 && (
              <div className="space-y-1">
                <Text type="supporting" color="secondary">
                  Detected items
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {interpretation.detectedItems.map((d, i) => (
                    <Token key={i} size="sm" label={d.label} description={d.description} />
                  ))}
                </div>
              </div>
            )}
            {interpretation.suggestedAdditions.length > 0 && (
              <div className="space-y-1">
                <Text type="supporting" color="secondary">
                  Tasteful additions
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {interpretation.suggestedAdditions.map((a, i) => (
                    <Token key={i} size="sm" label={a.label} description={a.reason} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {explanation && !interpretation && <Text color="secondary">{explanation}</Text>}

      {matches.length === 0 ? (
        <Text color="secondary">
          No matches. Try a different phrasing or attach a moodboard.
        </Text>
      ) : (
        <ResultGrid matches={matches} />
      )}

      <Text type="supporting" color="secondary">
        mode: {mode}
        {modelsUsed.length ? ` · via ${modelsUsed.join(' + ')}` : ''}
      </Text>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Text color="secondary">Loading…</Text>}>
      <SearchInner />
    </Suspense>
  );
}
