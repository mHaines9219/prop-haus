import { NextResponse } from 'next/server';
import { recordEvents } from '@/lib/analytics';
import { parseAttachments } from '@/lib/upload';
import { runSearch } from '@/lib/search-modes';
import { SEARCH_MODES, type SearchMode } from '@/lib/types';
import { currentOrgId, currentPlan } from '@/lib/session';
import { getAllowance, recordUsage } from '@/lib/usage';
import type { MeteredMetric } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUERY = 400;

/** Copy for a spent allowance. Named per metric because they reset differently. */
const EXHAUSTED: Record<MeteredMetric, (limit: number) => string> = {
  aiSearchesPerMonth: (limit) =>
    `You have used all ${limit} AI searches on your plan this month. Keyword search stays available, and the count resets at the start of next month.`,
  visionSearches: (limit) =>
    `You have used all ${limit} image searches included with your plan. Text-based AI search still works.`,
};

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY) {
    return bad('OPENROUTER_API_KEY is not set. Copy .env.local.example to .env.local.', 500);
  }

  const ct = req.headers.get('content-type') || '';

  let query: string | undefined;
  let mode: SearchMode = 'text';
  let attachments: Awaited<ReturnType<typeof parseAttachments>>['attachments'] = [];

  if (ct.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return bad('Invalid multipart/form-data');
    }
    const q = form.get('query');
    if (typeof q === 'string') query = q;
    const m = form.get('mode');
    if (typeof m === 'string' && (SEARCH_MODES as readonly string[]).includes(m)) mode = m as SearchMode;
    const { attachments: parsed, error } = await parseAttachments(form);
    if (error) return bad(error);
    attachments = parsed;
  } else {
    let body: { query?: unknown; mode?: unknown };
    try {
      body = (await req.json()) as { query?: unknown; mode?: unknown };
    } catch {
      return bad('Invalid JSON body');
    }
    if (typeof body.query === 'string') query = body.query;
    if (typeof body.mode === 'string' && (SEARCH_MODES as readonly string[]).includes(body.mode)) {
      mode = body.mode as SearchMode;
    }
  }

  query = query?.trim();
  if (query && query.length > MAX_QUERY) return bad(`query too long (max ${MAX_QUERY} chars)`);
  if (!query && attachments.length === 0) return bad('query or attachments required');

  // Auto-promote mode if files are attached but mode is 'text'.
  if (mode === 'text' && attachments.length > 0) mode = 'haiku';

  // --- metering -------------------------------------------------------------
  // Everything above this line rejects the request without spending anything, so
  // the gate sits here rather than at the top of the handler: a 400 for bad
  // multipart or a 500 for a missing API key must not cost the caller a search.
  //
  // The metric is keyed off `attachments.length`, not `mode`. A vision-capable
  // mode with no image attached is just a text search and should be charged as one.
  const metric: MeteredMetric =
    attachments.length > 0 ? 'visionSearches' : 'aiSearchesPerMonth';
  const orgId = await currentOrgId();
  const plan = await currentPlan();

  const allowance = await getAllowance(orgId, plan, metric);
  // `limit !== null` is implied by `!allowed` (see the Allowance type); checking it
  // here narrows the type without an assertion, and an unlimited plan can never
  // reach this branch.
  if (!allowance.allowed && allowance.limit !== null) {
    // The ceiling is the one request in this handler that carries real intent and
    // would otherwise leave no trace at all — it returns before the instrumentation
    // below. `paywall_hit` has been in EVENT_TYPES since the initial schema with
    // zero callers; this is the caller. It is also the only data that can answer
    // whether the limit is set right, since a limit nobody reaches and a limit
    // everybody slams into look identical without it.
    await recordEvents({
      type: 'paywall_hit',
      payload: { feature: 'ai_search', metric, query: query ?? '', mode },
    });

    // 402 rather than 429: this is a plan ceiling, not rate limiting. Retrying
    // later does not help within the period, and the client renders an upgrade
    // prompt rather than a "try again" one.
    return NextResponse.json(
      { error: EXHAUSTED[metric](allowance.limit), metric, usage: allowance },
      { status: 402 },
    );
  }

  try {
    const result = await runSearch({ query, attachments, mode });

    // Charged only once the search actually produced something. Two cases go free:
    //
    //   - a 502 from the model provider (the catch below never reaches here)
    //   - a search that succeeded and matched NOTHING
    //
    // The second is the one worth defending. A zero-result search is usually our
    // retrieval failing, not the user asking badly — Bumble measured 15% of
    // known-item queries as unreachable by any reranker, because the item never
    // enters the shortlist. Billing someone for our own miss is the wrong end of
    // that trade, and on a small monthly allowance two dead searches would burn a
    // large slice of the month on nothing. There is no abuse angle either: a
    // result set of zero has nothing in it to extract.
    //
    // We still pay the provider for these. That is the cost of a bad search, and
    // it belongs to us rather than the customer.
    const usage =
      result.matches.length > 0
        ? await recordUsage(orgId, plan, metric)
        : await getAllowance(orgId, plan, metric);

    // Recorded after the charge — every `bad()` return above and the 502 below
    // produced nothing, and charging demand signal for a failed request would
    // corrupt the one dataset the brief leans on.
    //
    // `vision_search` keys off `metric` rather than re-deriving from
    // `attachments.length`. Same fact, one source: two variables reading it is
    // how the billed metric and the logged event eventually disagree about what
    // a request was.
    await recordEvents(
      { type: 'search', payload: { mode, query: query ?? '', resultCount: result.matches.length } },
      ...(metric === 'visionSearches' ? [{ type: 'vision_search' as const, payload: { mode } }] : []),
      ...(result.matches.length === 0
        ? [{ type: 'zero_result_search' as const, payload: { query: query ?? '', mode } }]
        : []),
    );

    return NextResponse.json({ ...result, usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, mode }, { status: 502 });
  }
}
