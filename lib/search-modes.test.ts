import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePropItem } from '@/test/fixtures/catalog';
import type { Attachment, MoodboardInterpretation } from './types';

/**
 * The search dispatcher. The reranker talks to OpenRouter over fetch (the SDK
 * packages are mocked only so nothing here can ever reach them); the shortlist
 * and the vision pass are mocked at their module seams. What is under test:
 * mode routing, the recall-expansion retry, the keyword fallback, id
 * validation against the shortlist, bucket merging, and attachment blocks.
 */

vi.mock('openai', () => ({ default: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn() }));
vi.mock('./search-index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./search-index')>()),
  shortlistByEmbedding: vi.fn(),
}));
vi.mock('./moodboard', () => ({ interpretMoodboard: vi.fn() }));
vi.mock('./catalog', () => ({ loadCatalog: vi.fn(async () => []) }));

import { shortlistByEmbedding } from './search-index';
import { interpretMoodboard } from './moodboard';
import { loadCatalog } from './catalog';
import { runSearch } from './search-modes';

const RERANK = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const SONNET = 'anthropic/claude-sonnet-4.6';
const HAIKU = 'anthropic/claude-haiku-4.5';

const A = makePropItem({ sourceId: 'a', name: 'Walnut Credenza' });
const B = makePropItem({ sourceId: 'b', name: 'Arc Lamp', category: 'lighting' });
const shortlist = (...items: typeof A[]) => items.map((item, i) => ({ item, score: 1 - i / 10 }));

const fetchMock = vi.fn<typeof fetch>();

function reply(content: string) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
  );
}

function requestBody(call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call][1]!.body as string);
}

const interp: MoodboardInterpretation = {
  overall: { style: ['mid-century-modern'], vibes: [], summary: 'A warm sixties den.' },
  detectedItems: [
    {
      label: 'walnut credenza',
      description: 'Long low credenza',
      style: ['mid-century-modern'],
      era: '1960s',
      materials: ['walnut'],
      colors: ['brown'],
    },
  ],
  suggestedAdditions: [{ label: 'arc lamp', reason: 'to light the corner' }],
};

const image: Attachment = { kind: 'image', mime: 'image/png', filename: 'a.png', dataUrl: 'data:image/png;base64,AAA' };
const pdf: Attachment = { kind: 'pdf', mime: 'application/pdf', filename: 'deck.pdf', dataUrl: 'data:application/pdf;base64,BBB' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENROUTER_API_KEY', 'or-key');
  fetchMock.mockReset();
  vi.mocked(shortlistByEmbedding).mockReset();
  vi.mocked(interpretMoodboard).mockReset();
  vi.mocked(loadCatalog).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('dispatch', () => {
  it('asks for input when there is neither a query nor an attachment', async () => {
    const res = await runSearch({ query: '   ', attachments: [], mode: 'haiku' });
    expect(res).toEqual({
      query: '   ',
      mode: 'text',
      modelsUsed: [],
      matches: [],
      explanation: 'Provide a text query or attach a moodboard.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shortlistByEmbedding).not.toHaveBeenCalled();
  });

  it('ignores attachments in text mode', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    reply('{"ids":["omega-a"],"explanation":"ok"}');
    const res = await runSearch({ query: 'credenza', attachments: [image], mode: 'text' });
    expect(res.mode).toBe('text');
    expect(interpretMoodboard).not.toHaveBeenCalled();
  });

  it('falls back to text for an unknown mode', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    reply('{"ids":["omega-a"],"explanation":"ok"}');
    const res = await runSearch({ query: 'credenza', attachments: [image], mode: 'opus' as never });
    expect(res.mode).toBe('text');
  });
});

describe('text mode', () => {
  it('reranks the shortlist and scores by rank', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A, B));
    reply('{"ids":["omega-b","omega-a"],"explanation":"Lamp first."}');

    const res = await runSearch({ query: '  arc lamp ', attachments: [], mode: 'text' });

    expect(res.query).toBe('arc lamp');
    expect(res.modelsUsed).toEqual([RERANK]);
    expect(res.explanation).toBe('Lamp first.');
    expect(res.matches).toEqual([
      { item: B, matchedVia: ['query'], score: 1 },
      { item: A, matchedVia: ['query'], score: 0.5 },
    ]);
    expect(shortlistByEmbedding).toHaveBeenCalledWith('arc lamp', 50);
  });

  it('sends the query and shortlist to OpenRouter with the key', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    reply('{"ids":["omega-a"]}');
    await runSearch({ query: 'credenza', attachments: [], mode: 'text' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer or-key');
    const body = requestBody();
    expect(body.model).toBe(RERANK);
    expect(body.response_format).toEqual({ type: 'json_object' });
    const user = (body.messages as Array<{ role: string; content: string }>)[1].content;
    expect(user).toContain('USER REQUEST:\ncredenza');
    expect(user).toContain('SHORTLIST (1 candidates)');
    expect(user).toContain('omega-a | storage-credenzas/credenzas | Walnut Credenza');
  });

  it('drops ids the model invented or mistyped', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A, B));
    reply('{"ids":["omega-a","not-real",42,null],"explanation":"x"}');
    const res = await runSearch({ query: 'credenza', attachments: [], mode: 'text' });
    expect(res.matches.map((m) => m.item.id)).toEqual(['omega-a']);
  });

  it('reads JSON out of a markdown fence and out of surrounding prose', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    reply('```json\n{"ids":["omega-a"],"explanation":"fenced"}\n```');
    expect((await runSearch({ query: 'q', attachments: [], mode: 'text' })).explanation).toBe('fenced');

    reply('Sure! Here you go: {"ids":["omega-a"],"explanation":"prose"} Hope that helps.');
    expect((await runSearch({ query: 'q', attachments: [], mode: 'text' })).explanation).toBe('prose');
  });

  it('widens the shortlist to 150 and retries once when the reranker returns nothing', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValueOnce(shortlist(A)).mockResolvedValueOnce(shortlist(A, B));
    reply('{"ids":[],"explanation":"nothing fits"}');
    reply('{"ids":["omega-b"],"explanation":"found on retry"}');

    const res = await runSearch({ query: 'lamp', attachments: [], mode: 'text' });

    expect(shortlistByEmbedding).toHaveBeenNthCalledWith(1, 'lamp', 50);
    expect(shortlistByEmbedding).toHaveBeenNthCalledWith(2, 'lamp', 150);
    expect(res.matches.map((m) => m.item.id)).toEqual(['omega-b']);
    expect(res.explanation).toBe('found on retry');
  });

  it('falls back to keyword matches when the embedding path finds nothing', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue([]);
    vi.mocked(loadCatalog).mockResolvedValue([A, B]);

    const res = await runSearch({ query: 'arc lamp', attachments: [], mode: 'text' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(shortlistByEmbedding).toHaveBeenCalledTimes(1);
    expect(res.matches.map((m) => m.item.id)).toEqual(['omega-b']);
    expect(res.explanation).toBe('Showing keyword matches for "arc lamp" — no semantic matches found.');
    expect(res.modelsUsed).toEqual([RERANK]);
  });

  it('falls back to keywords after the retry also comes back empty', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    vi.mocked(loadCatalog).mockResolvedValue([A]);
    reply('{"ids":[]}');
    reply('this is not json at all');

    const res = await runSearch({ query: 'credenza', attachments: [], mode: 'text' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.matches.map((m) => m.item.id)).toEqual(['omega-a']);
    expect(res.explanation).toContain('keyword matches');
  });

  it('returns an empty result when neither path finds anything', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue([]);
    const res = await runSearch({ query: 'zzzz', attachments: [], mode: 'text' });
    expect(res.matches).toEqual([]);
    expect(res.explanation).toBe('');
  });

  it('throws when OpenRouter answers with an error status', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(runSearch({ query: 'q', attachments: [], mode: 'text' })).rejects.toThrow('OpenRouter 429: rate limited');
  });

  it('throws when the API key is missing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    await expect(runSearch({ query: 'q', attachments: [], mode: 'text' })).rejects.toThrow('OPENROUTER_API_KEY is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a response with no content as an empty answer', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response('{"choices":[{}]}', { status: 200 }));
    const res = await runSearch({ query: 'q', attachments: [], mode: 'text' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.matches).toEqual([]);
    expect(res.explanation).toBe('');
  });
});

describe('vision modes (haiku, sonnet)', () => {
  beforeEach(() => {
    vi.mocked(interpretMoodboard).mockResolvedValue({ interpretation: interp, modelUsed: HAIKU });
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A, B));
  });

  it('builds one bucket per detected item, addition and brief, and merges the reranks', async () => {
    reply('{"ids":["omega-a"]}');
    reply('{"ids":["omega-b"]}');
    reply('{"ids":["omega-a","omega-b"]}');

    const res = await runSearch({ query: 'den', attachments: [image], mode: 'haiku' });

    expect(interpretMoodboard).toHaveBeenCalledWith([image], 'den', 'haiku');
    expect(vi.mocked(shortlistByEmbedding).mock.calls).toEqual([
      ['walnut credenza. Long low credenza. mid-century-modern 1960s walnut brown', 30],
      ['arc lamp. to light the corner', 30],
      ['den', 30],
    ]);
    expect(res.mode).toBe('haiku');
    expect(res.modelsUsed).toEqual([HAIKU, RERANK]);
    expect(res.interpretation).toBe(interp);
    expect(res.explanation).toBe('A warm sixties den.');
    expect(res.matches).toEqual([
      { item: A, matchedVia: ['walnut credenza', 'brief'], score: 1 },
      { item: B, matchedVia: ['tasteful addition: arc lamp', 'brief'], score: 0.9 },
    ]);
  });

  it('skips the brief bucket when there is no query', async () => {
    reply('{"ids":["omega-a"]}');
    reply('{"ids":[]}');
    const res = await runSearch({ attachments: [image], mode: 'sonnet' });
    expect(shortlistByEmbedding).toHaveBeenCalledTimes(2);
    expect(res.mode).toBe('sonnet');
    expect(res.matches.map((m) => m.matchedVia)).toEqual([['walnut credenza']]);
  });

  it('caps each bucket at its own topN', async () => {
    const many = Array.from({ length: 6 }, (_, i) => makePropItem({ sourceId: `m${i}` }));
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(...many));
    vi.mocked(interpretMoodboard).mockResolvedValue({
      interpretation: { ...interp, detectedItems: [] },
      modelUsed: HAIKU,
    });
    reply(JSON.stringify({ ids: many.map((m) => m.id) }));
    const res = await runSearch({ attachments: [image], mode: 'haiku' });
    expect(res.matches).toHaveLength(4);
  });

  it('returns no matches, not an error, when the shortlists are empty', async () => {
    vi.mocked(shortlistByEmbedding).mockResolvedValue([]);
    const res = await runSearch({ query: 'den', attachments: [image], mode: 'haiku' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.matches).toEqual([]);
  });
});

describe('haiku-then-sonnet', () => {
  beforeEach(() => {
    vi.mocked(interpretMoodboard).mockResolvedValue({ interpretation: interp, modelUsed: HAIKU });
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A, B));
  });

  it('answers from the interpretation alone when there is nothing to match', async () => {
    const empty = { ...interp, detectedItems: [], suggestedAdditions: [] };
    vi.mocked(interpretMoodboard).mockResolvedValue({ interpretation: empty, modelUsed: HAIKU });
    const res = await runSearch({ attachments: [image], mode: 'haiku-then-sonnet' });
    expect(res).toEqual({
      query: undefined,
      mode: 'haiku-then-sonnet',
      modelsUsed: [HAIKU, SONNET],
      interpretation: empty,
      matches: [],
      explanation: 'A warm sixties den.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one Sonnet call with the pool, the groups and every attachment', async () => {
    reply('{"groups":[],"explanation":""}');
    await runSearch({ query: ' den ', attachments: [image, pdf], mode: 'haiku-then-sonnet' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody();
    expect(body.model).toBe(SONNET);
    const messages = body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(messages[0].content[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
    const [text, ...blocks] = messages[1].content;
    expect(text.text).toContain('USER BRIEF: den');
    expect(text.text).toContain('MOODBOARD SUMMARY: A warm sixties den.');
    expect(text.text).toContain('1. walnut credenza — Long low credenza.');
    expect(text.text).toContain('2. tasteful addition: arc lamp — to light the corner');
    expect(text.text).toContain('CANDIDATE POOL (2 items)');
    expect(blocks).toEqual([
      { type: 'image_url', image_url: { url: image.dataUrl } },
      { type: 'file', file: { filename: 'deck.pdf', file_data: pdf.dataUrl } },
    ]);
  });

  it('groups the picks, drops unlabeled groups and unknown ids, caps six per group', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => makePropItem({ sourceId: `p${i}` }));
    vi.mocked(shortlistByEmbedding).mockResolvedValue(shortlist(A, B, ...eight));
    reply(
      JSON.stringify({
        groups: [
          { label: 'walnut credenza', ids: ['omega-a', 'ghost', 7] },
          { label: '', ids: ['omega-b'] },
          { label: 'arc lamp', ids: ['omega-b', 'omega-a'] },
          { label: 'filler', ids: eight.map((m) => m.id) },
          'not a group',
        ],
        explanation: 'Picked two.',
      }),
    );

    const res = await runSearch({ attachments: [image], mode: 'haiku-then-sonnet' });

    expect(res.explanation).toBe('Picked two.');
    expect(res.modelsUsed).toEqual([HAIKU, SONNET]);
    const byId = new Map(res.matches.map((m) => [m.item.id, m]));
    expect(byId.get('omega-a')).toEqual({ item: A, matchedVia: ['walnut credenza', 'arc lamp'], score: 1 });
    expect(byId.get('omega-b')).toEqual({ item: B, matchedVia: ['arc lamp'], score: 1 });
    expect(res.matches.filter((m) => m.matchedVia.includes('filler'))).toHaveLength(6);
  });

  it('falls back to the moodboard summary when the explanation is empty or unparseable', async () => {
    reply('{"groups":[{"label":"x","ids":["omega-a"]}],"explanation":""}');
    expect((await runSearch({ attachments: [image], mode: 'haiku-then-sonnet' })).explanation).toBe('A warm sixties den.');

    reply('<html>gateway timeout</html>');
    const res = await runSearch({ attachments: [image], mode: 'haiku-then-sonnet' });
    expect(res.explanation).toBe('A warm sixties den.');
    expect(res.matches).toEqual([]);
  });

  it('propagates a failed vision pass', async () => {
    vi.mocked(interpretMoodboard).mockRejectedValue(new Error('OpenRouter 500: down'));
    await expect(runSearch({ attachments: [image], mode: 'haiku-then-sonnet' })).rejects.toThrow('OpenRouter 500: down');
  });
});
