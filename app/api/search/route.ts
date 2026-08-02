import { NextResponse } from 'next/server';
import { recordEvents } from '@/lib/analytics';
import { parseAttachments } from '@/lib/upload';
import { runSearch } from '@/lib/search-modes';
import { SEARCH_MODES, type SearchMode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUERY = 400;

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

  try {
    const result = await runSearch({ query, attachments, mode });

    // Recorded only after the search actually succeeded — every `bad()` return
    // above and the 502 below produced nothing, and charging demand signal for
    // a failed request would corrupt the one dataset the brief leans on.
    // `vision_search` keys off real attachments, not the mode string: a vision
    // mode with no image attached is a text search wearing a hat.
    const isVision = attachments.length > 0;
    await recordEvents(
      { type: 'search', payload: { mode, query: query ?? '', resultCount: result.matches.length } },
      ...(isVision ? [{ type: 'vision_search' as const, payload: { mode } }] : []),
      ...(result.matches.length === 0
        ? [{ type: 'zero_result_search' as const, payload: { query: query ?? '', mode } }]
        : []),
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, mode }, { status: 502 });
  }
}
