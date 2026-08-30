'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ItemCard } from '@/components/ap/item-card';
import { ItemCardSkeleton } from '@/components/ap/item-card-skeleton';
import { PageShell } from '@/components/ap/page-shell';
import { GridCell, SeamGrid } from '@/components/ap/seam-grid';
import { ApiError, getJson, postForm, postJson } from '@/lib/api';
import type { PlanTier } from '@/lib/accounts';
import type { MeteredMetric } from '@/lib/plans';
import type { CardItem, MoodboardInterpretation, SearchResponse } from '@/lib/types';
import type { Allowance } from '@/lib/usage';
import { SearchControls } from './search-controls';

// Both the keyword endpoint (card-projected items) and the AI endpoint (full
// PropItems, which are assignable to CardItem) feed the same result grid.
type CardMatch = { item: CardItem; matchedVia: string[]; score: number };
type KeywordResponse = { query: string; matches: CardMatch[]; total: number };
type UsageResponse = { plan: PlanTier; metrics: Record<MeteredMetric, Allowance> };
/** /api/search reports the allowance it charged alongside the results. */
type SearchWithUsage = SearchResponse & { usage?: Allowance };

/** Plan ceiling reached. lib/api.ts turns the 402 body's `error` into the message. */
const isPaywall = (e: unknown) => e instanceof ApiError && e.status === 402;

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const wantsAI = params.get('ai') === '1';
  const urlBudget = params.get('budget') ? Number(params.get('budget')) : null;

  const qc = useQueryClient();

  // A moodboard result lives only in memory (files can't ride the URL), so it is
  // tracked separately and superseded whenever a text search changes the URL.
  // State (not a ref) so the switch to AI results re-renders immediately.
  const [moodboardActive, setMoodboardActive] = useState(false);

  const keyword = useQuery({
    queryKey: ['keyword', urlQuery],
    enabled: !wantsAI && !moodboardActive && !!urlQuery,
    queryFn: () => getJson<KeywordResponse>(`/api/keyword?q=${encodeURIComponent(urlQuery)}`),
  });

  const usage = useQuery({
    queryKey: ['usage'],
    queryFn: () => getJson<UsageResponse>('/api/usage'),
  });

  const ai = useMutation({
    mutationFn: (input: string | FormData) =>
      typeof input === 'string'
        ? postJson<SearchWithUsage>('/api/search', { query: input, mode: 'text' })
        : postForm<SearchWithUsage>('/api/search', input),
    // A successful search returns the standing it just charged against, so the
    // counter updates from that same transaction rather than from a follow-up
    // read that could race it.
    onSuccess: ({ usage: charged }) => {
      if (!charged) return;
      qc.setQueryData<UsageResponse>(['usage'], (prev) =>
        prev ? { ...prev, metrics: { ...prev.metrics, [charged.metric]: charged } } : prev,
      );
    },
    // On failure there is no such payload — including the 402, where the count
    // on screen is exactly what turned out to be wrong. Refetch instead.
    onError: () => qc.invalidateQueries({ queryKey: ['usage'] }),
  });

  // Text AI search is driven by the URL (?ai=1). Fire once per distinct query+budget combo.
  const lastAiRun = useRef<string | null>(null);
  useEffect(() => {
    const runKey = `${urlQuery}::${urlBudget ?? ''}`;
    if (wantsAI && urlQuery && lastAiRun.current !== runKey) {
      lastAiRun.current = runKey;
      const queryWithBudget = urlBudget
        ? `${urlQuery}\n\nBudget: $${urlBudget.toLocaleString()}`
        : urlQuery;
      ai.mutate(queryWithBudget);
    }
  }, [wantsAI, urlQuery, urlBudget, ai]);

  // A text search (URL change) always supersedes an in-memory moodboard result.
  // goText resets this synchronously; the effect is the backstop for any other
  // entry that changes the URL while a moodboard result is on screen.
  useEffect(() => {
    setMoodboardActive(false);
  }, [urlQuery, wantsAI]);

  const goText = (q: string, engine: 'keyword' | 'ai', budget?: number | null) => {
    setMoodboardActive(false);
    const p = new URLSearchParams({ q });
    if (engine === 'ai') p.set('ai', '1');
    if (budget) p.set('budget', String(budget));
    router.push(`/search?${p.toString()}`);
  };

  const showAi = wantsAI || moodboardActive;
  const loading = showAi ? ai.isPending : keyword.isFetching;
  const error = showAi ? ai.error : keyword.error;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
      <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
        Search
      </p>
      <div className="mt-4 max-w-[760px]">
        <SearchControls
          initialQuery={urlQuery}
          initialEngine={wantsAI ? 'ai' : 'keyword'}
          onText={goText}
          onMultipart={(form) => {
            setMoodboardActive(true);
            ai.mutate(form);
          }}
        />
        {usage.data && <AllowanceLine metrics={usage.data.metrics} />}
      </div>

      <div className="mt-10">
        {loading ? (
          <>
            <p className="mb-5 font-mono text-[13px] leading-[18px] text-text-tertiary">
              {showAi ? 'Reading the catalog.' : 'Searching.'}
            </p>
            <SeamGrid>
              {Array.from({ length: 12 }, (_, i) => (
                <ItemCardSkeleton key={i} />
              ))}
            </SeamGrid>
          </>
        ) : error ? (
          isPaywall(error) ? (
            <ErrorRow title="Search limit reached">{error.message}</ErrorRow>
          ) : (
            <ErrorRow title="That search did not go through">
              {error.message}
              {error.message.includes('OPENROUTER_API_KEY') && (
                <span className="mt-2 block text-text-tertiary">
                  Copy .env.local.example to .env.local, paste your OpenRouter key, then restart the
                  dev server.
                </span>
              )}
            </ErrorRow>
          )
        ) : showAi && ai.data ? (
          <AiResults data={ai.data} />
        ) : !showAi && keyword.data ? (
          <KeywordResults data={keyword.data} onAskAI={() => goText(urlQuery, 'ai')} />
        ) : (
          <EmptyPrompt />
        )}
      </div>
    </div>
  );
}

function KeywordResults({ data, onAskAI }: { data: KeywordResponse; onAskAI: () => void }) {
  const { matches, total, query } = data;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[13px] leading-[18px] text-text-tertiary">
          {total === 0
            ? `No metadata matches for “${query}”`
            : `${total.toLocaleString()} ${total === 1 ? 'match' : 'matches'} for “${query}”`}
        </p>
        <button
          onClick={onAskAI}
          className="h-9 rounded-md border border-border px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-foreground"
        >
          Ask AI to curate
        </button>
      </div>

      {matches.length === 0 ? (
        <div className="border-y border-border py-16 text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            No direct matches
          </p>
          <p className="mt-2 text-[15px] text-text-secondary">
            Nothing matched those words directly. Ask AI to interpret the brief instead.
          </p>
        </div>
      ) : (
        <ResultGrid matches={matches} />
      )}
    </>
  );
}

function AiResults({ data }: { data: SearchResponse }) {
  const { interpretation, matches, explanation, modelsUsed, mode } = data;
  return (
    <>
      {interpretation && <Interpretation interpretation={interpretation} />}

      {explanation && !interpretation && (
        <p className="mb-5 max-w-[70ch] text-[15px] leading-[22px] text-text-secondary">
          {explanation}
        </p>
      )}

      {matches.length === 0 ? (
        <div className="border-y border-border py-16 text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            No matches
          </p>
          <p className="mt-2 text-[15px] text-text-secondary">
            Try a different phrasing, or attach a moodboard.
          </p>
        </div>
      ) : (
        <ResultGrid matches={matches} />
      )}

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
        {mode}
        {modelsUsed.length ? ` · ${modelsUsed.join(' + ')}` : ''}
      </p>
    </>
  );
}

/** AI read of a moodboard: a bordered panel on raised chrome, mono eyebrow. */
function Interpretation({ interpretation }: { interpretation: MoodboardInterpretation }) {
  const { overall, detectedItems, suggestedAdditions } = interpretation;
  const tags = [
    ...overall.style.map((v) => v),
    ...(overall.era ? [overall.era] : []),
    ...overall.vibes,
    ...(overall.settingType ?? []),
  ];

  return (
    <div className="mb-8 border border-border bg-card p-6">
      <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
        AI read your moodboard
      </p>
      {overall.summary && (
        <h2 className="mt-3 text-[18px] font-semibold leading-[24px] text-foreground">
          {overall.summary}
        </h2>
      )}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t, i) => (
            <Chip key={i}>{t}</Chip>
          ))}
        </div>
      )}
      {detectedItems.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
            Detected items
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {detectedItems.map((d, i) => (
              <Chip key={i} title={d.description}>
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {suggestedAdditions.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
            Tasteful additions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedAdditions.map((a, i) => (
              <Chip key={i} title={a.reason}>
                {a.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-md border border-border bg-surface-inset px-2 py-1 font-mono text-[11px] leading-[14px] text-text-secondary"
    >
      {children}
    </span>
  );
}

function ResultGrid({ matches }: { matches: CardMatch[] }) {
  return (
    <SeamGrid>
      {matches.map((m, i) => (
        <GridCell key={m.item.id} index={i}>
          <ItemCard item={m.item} />
        </GridCell>
      ))}
    </SeamGrid>
  );
}

/**
 * "3 of 5 AI searches left today" — omitted entirely on unlimited plans, where a
 * counter is noise rather than information.
 */
function AllowanceLine({ metrics }: { metrics: Record<MeteredMetric, Allowance> }) {
  const parts = [
    { a: metrics.aiSearchesPerDay, noun: 'AI searches', suffix: ' today' },
    { a: metrics.visionSearches, noun: 'image searches', suffix: '' },
  ]
    .filter(({ a }) => a.limit !== null)
    .map(({ a, noun, suffix }) => `${a.remaining} of ${a.limit} ${noun} left${suffix}`);

  if (parts.length === 0) return null;
  return (
    <p className="mt-3 font-mono text-[13px] leading-[18px] text-text-tertiary">{parts.join(' · ')}</p>
  );
}

function ErrorRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-y border-l-2 border-border border-l-accent bg-surface-inset/40 px-5 py-4">
      <p className="text-[15px] text-foreground">{title}</p>
      <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">{children}</p>
    </div>
  );
}

function EmptyPrompt() {
  return (
    <div className="border-y border-border py-16 text-center">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        Start a search
      </p>
      <p className="mt-2 text-[15px] text-text-secondary">
        Describe the scene above, or attach a moodboard for AI to interpret.
      </p>
    </div>
  );
}

export default function SearchPage() {
  return (
    <PageShell>
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6">
            <p className="font-mono text-[13px] text-text-tertiary">Loading.</p>
          </div>
        }
      >
        <SearchInner />
      </Suspense>
    </PageShell>
  );
}
