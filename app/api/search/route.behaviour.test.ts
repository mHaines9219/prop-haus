import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileOf, formRequest, jsonRequest, rawRequest, readJson } from '@/test/helpers/request';
import { makePropItem } from '@/test/fixtures/catalog';
import type { Allowance } from '@/lib/usage';
import type { MeteredMetric } from '@/lib/plans';
import type { SearchResponse } from '@/lib/types';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());
vi.mock('@/lib/search-modes', () => ({ runSearch: vi.fn() }));
vi.mock('@/lib/usage', () => ({ getAllowance: vi.fn(), recordUsage: vi.fn() }));

import { ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { runSearch } from '@/lib/search-modes';
import { getAllowance, recordUsage } from '@/lib/usage';
import { POST } from './route';

/**
 * The metered route, exercised rather than read (route.test.ts guards the
 * wiring by reading source). Order matters: validation before session, session
 * before the gate, the gate before the model, the charge only after a hit.
 */

function allowance(metric: MeteredMetric, over: Partial<Allowance> = {}): Allowance {
  return { metric, period: 'p', used: 0, limit: 5, remaining: 5, allowed: true, ...over };
}

function result(over: Partial<SearchResponse> = {}): SearchResponse {
  return { query: 'walnut', mode: 'text', modelsUsed: ['m'], matches: [{ item: makePropItem(), matchedVia: [], score: 1 }], ...over };
}

function multipart(fields: Record<string, string | File | File[]>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const f of v) form.append(k, f);
    else form.set(k, v);
  }
  return formRequest('/api/search', form);
}

const search = (body: unknown) => POST(jsonRequest('/api/search', body));
const png = () => fileOf('board.png', 'image/png', 8);

beforeEach(() => {
  db.reset();
  signIn();
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.mocked(runSearch).mockReset().mockResolvedValue(result());
  vi.mocked(getAllowance).mockReset().mockImplementation(async (_org, _plan, metric) => allowance(metric));
  vi.mocked(recordUsage).mockReset().mockImplementation(async (_org, _plan, metric) => allowance(metric, { used: 1, remaining: 4 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('before the session', () => {
  it('500 without the provider key, reading nothing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const res = await search({ query: 'walnut' });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'OPENROUTER_API_KEY is not set. Copy .env.local.example to .env.local.' });
    expect(getAllowance).not.toHaveBeenCalled();
  });

  it('400 for malformed JSON', async () => {
    const res = await POST(rawRequest('/api/search', '{nope', { headers: { 'content-type': 'application/json' } }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Invalid JSON body' });
  });

  it.each([[{}], [{ query: '' }], [{ query: '   ' }], [{ query: 42 }], [{ query: null }]])('400 for %j', async (body) => {
    const res = await search(body);
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'query or attachments required' });
  });

  it('400 for a query over 400 characters', async () => {
    const res = await search({ query: 'x'.repeat(401) });
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'query too long (max 400 chars)' });
    expect((await search({ query: 'x'.repeat(400) })).status).toBe(200);
  });

  it('400 for unparseable multipart', async () => {
    const res = await POST(
      rawRequest('/api/search', 'garbage', { headers: { 'content-type': 'multipart/form-data; boundary=nope' } }),
    );
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Invalid multipart/form-data' });
  });

  it('400 for too many attachments', async () => {
    const res = await POST(multipart({ query: 'x', files: Array.from({ length: 7 }, png) }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Too many files (max 6)' });
  });

  it('400 for an unsupported attachment type', async () => {
    const res = await POST(multipart({ files: [fileOf('notes.txt', 'text/plain', 8)] }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'Unsupported file type for notes.txt: text/plain' });
  });

  it('400 for an attachment over 8MB', async () => {
    const res = await POST(multipart({ files: [fileOf('huge.png', 'image/png', 8 * 1024 * 1024 + 1)] }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'huge.png is too large (>8MB)' });
  });

  it('rejects a bad body as 400 even when signed out, and spends nothing', async () => {
    signOut();
    expect((await search({})).status).toBe(400);
    expect(getAllowance).not.toHaveBeenCalled();
    expect(runSearch).not.toHaveBeenCalled();
    expect(db.rows('events')).toEqual([]);
  });
});

describe('session and gate', () => {
  it('401 when signed out, before the gate or the model', async () => {
    signOut();
    const res = await search({ query: 'walnut' });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'Sign in to use AI search. Keyword search and browsing stay open.' });
    expect(getAllowance).not.toHaveBeenCalled();
    expect(runSearch).not.toHaveBeenCalled();
  });

  it('402 when the daily allowance is spent: no model call, no charge, paywall_hit recorded', async () => {
    vi.mocked(getAllowance).mockResolvedValue(allowance('aiSearchesPerDay', { used: 5, remaining: 0, allowed: false }));
    const res = await search({ query: 'walnut' });
    expect(res.status).toBe(402);
    expect(await readJson(res)).toEqual({
      error: 'You have used all 5 AI searches on your plan today. Keyword search stays available, and the count resets at midnight UTC.',
      metric: 'aiSearchesPerDay',
      usage: allowance('aiSearchesPerDay', { used: 5, remaining: 0, allowed: false }),
    });
    expect(getAllowance).toHaveBeenCalledWith(ORG_ID, 'free', 'aiSearchesPerDay');
    expect(runSearch).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
    expect(db.rows('events')).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        user_id: null,
        type: 'paywall_hit',
        payload: { feature: 'ai_search', metric: 'aiSearchesPerDay', query: 'walnut', mode: 'text' },
      }),
    ]);
  });

  it('402 with the image copy when the vision trial is spent', async () => {
    vi.mocked(getAllowance).mockResolvedValue(allowance('visionSearches', { limit: 3, used: 3, remaining: 0, allowed: false }));
    const res = await POST(multipart({ files: [png()] }));
    expect(res.status).toBe(402);
    expect(await readJson(res)).toMatchObject({
      error: 'You have used all 3 image searches included with your plan. Text-based AI search still works.',
      metric: 'visionSearches',
    });
    expect(db.rows('events')[0]).toMatchObject({ type: 'paywall_hit', payload: { metric: 'visionSearches', query: '', mode: 'haiku' } });
  });

  it('gates with the plan on the session', async () => {
    signIn({ plan: 'pro' });
    await search({ query: 'walnut' });
    expect(getAllowance).toHaveBeenCalledWith(ORG_ID, 'pro', 'aiSearchesPerDay');
    expect(recordUsage).toHaveBeenCalledWith(ORG_ID, 'pro', 'aiSearchesPerDay');
  });
});

describe('a search that hits', () => {
  it('runs the model, charges once, and records the search with the standing after', async () => {
    const res = await search({ query: '  walnut  ' });
    expect(res.status).toBe(200);
    expect(runSearch).toHaveBeenCalledWith({ query: 'walnut', attachments: [], mode: 'text' });
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(ORG_ID, 'free', 'aiSearchesPerDay');
    expect(await readJson(res)).toEqual({ ...result(), usage: allowance('aiSearchesPerDay', { used: 1, remaining: 4 }) });
    expect(db.rows('events')).toEqual([
      expect.objectContaining({ org_id: ORG_ID, type: 'search', payload: { mode: 'text', query: 'walnut', resultCount: 1 } }),
    ]);
  });

  it('honours a known mode and falls back to text for an unknown one', async () => {
    await search({ query: 'walnut', mode: 'sonnet' });
    expect(runSearch).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'sonnet' }));
    await search({ query: 'walnut', mode: 'gpt-9' });
    expect(runSearch).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'text' }));
  });

  it('a text-capable mode with no image is charged as a text search', async () => {
    await search({ query: 'walnut', mode: 'haiku' });
    expect(getAllowance).toHaveBeenCalledWith(ORG_ID, 'free', 'aiSearchesPerDay');
    expect(db.rows('events').map((e) => e.type)).toEqual(['search']);
  });
});

describe('a search that misses', () => {
  it('is not charged: re-reads the standing and records zero_result_search', async () => {
    vi.mocked(runSearch).mockResolvedValue(result({ matches: [] }));
    const res = await search({ query: 'zebra' });
    expect(res.status).toBe(200);
    expect(recordUsage).not.toHaveBeenCalled();
    expect(getAllowance).toHaveBeenCalledTimes(2);
    expect((await readJson<{ usage: Allowance }>(res)).usage).toEqual(allowance('aiSearchesPerDay'));
    expect(db.rows('events').map((e) => [e.type, e.payload])).toEqual([
      ['search', { mode: 'text', query: 'zebra', resultCount: 0 }],
      ['zero_result_search', { query: 'zebra', mode: 'text' }],
    ]);
  });
});

describe('vision', () => {
  it('promotes text to haiku, meters visionSearches, and records vision_search', async () => {
    vi.mocked(runSearch).mockResolvedValue(result({ mode: 'haiku' }));
    const res = await POST(multipart({ query: 'moody lounge', files: [png()] }));
    expect(res.status).toBe(200);
    expect(runSearch).toHaveBeenCalledWith({
      query: 'moody lounge',
      mode: 'haiku',
      attachments: [expect.objectContaining({ kind: 'image', mime: 'image/png', filename: 'board.png', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) })],
    });
    expect(getAllowance).toHaveBeenCalledWith(ORG_ID, 'free', 'visionSearches');
    expect(recordUsage).toHaveBeenCalledWith(ORG_ID, 'free', 'visionSearches');
    expect(db.rows('events').map((e) => [e.type, e.payload])).toEqual([
      ['search', { mode: 'haiku', query: 'moody lounge', resultCount: 1 }],
      ['vision_search', { mode: 'haiku' }],
    ]);
  });

  it('keeps an explicit multipart mode and accepts a PDF', async () => {
    vi.mocked(runSearch).mockResolvedValue(result({ mode: 'haiku-then-sonnet' }));
    await POST(multipart({ mode: 'haiku-then-sonnet', files: [fileOf('deck.pdf', 'application/pdf', 8)] }));
    expect(runSearch).toHaveBeenCalledWith(expect.objectContaining({ mode: 'haiku-then-sonnet', query: undefined }));
    expect(vi.mocked(runSearch).mock.calls[0][0].attachments[0].kind).toBe('pdf');
  });
});

describe('provider failure', () => {
  it('502 with the message and mode, charging and recording nothing', async () => {
    vi.mocked(runSearch).mockRejectedValue(new Error('upstream 529'));
    const res = await search({ query: 'walnut', mode: 'sonnet' });
    expect(res.status).toBe(502);
    expect(await readJson(res)).toEqual({ error: 'upstream 529', mode: 'sonnet' });
    expect(recordUsage).not.toHaveBeenCalled();
    expect(db.rows('events')).toEqual([]);
  });

  it('still answers 200 when analytics is down', async () => {
    db.failNext('events', 'insert', 'events table on fire');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await search({ query: 'walnut' });
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('search'));
  });
});
