import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENUM_LIST } from './enrichment-enums';
import { interpretMoodboard } from './moodboard';
import type { Attachment } from './types';

/**
 * The vision pass. The model is free to be sloppy; what reaches the rest of
 * the app must not be. So: the right model per mode, attachments as the
 * blocks OpenRouter expects, and a sanitizer that keeps only enum slugs and
 * labeled items no matter what JSON (or non-JSON) came back.
 */

const fetchMock = vi.fn<typeof fetch>();

const image: Attachment = { kind: 'image', mime: 'image/png', filename: 'a.png', dataUrl: 'data:image/png;base64,AAA' };
const pdf: Attachment = { kind: 'pdf', mime: 'application/pdf', filename: 'deck.pdf', dataUrl: 'data:application/pdf;base64,BBB' };

function reply(content: string) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
  );
}

function requestBody(): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
}

const FULL = {
  overall: {
    style: ['mid-century-modern', 'not-a-style', 7],
    era: '1960s',
    vibes: ['cozy', 'bogus'],
    settingType: ['living-room'],
    summary: 'A warm den.',
  },
  detectedItems: [
    {
      label: 'credenza',
      description: 'long and low',
      style: ['scandinavian', 'nope'],
      era: '1950s',
      materials: ['walnut', 'unobtainium'],
      colors: ['brown'],
    },
    { label: '', description: 'unlabeled, dropped' },
    { description: 'no label at all' },
    null,
  ],
  suggestedAdditions: [{ label: 'arc lamp', reason: 'corner light' }, { label: 'rug' }, { reason: 'x' }, 'junk'],
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENROUTER_API_KEY', 'or-key');
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('request', () => {
  it('refuses without an API key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(interpretMoodboard([image], 'q', 'haiku')).rejects.toThrow('OPENROUTER_API_KEY is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['haiku', 'anthropic/claude-haiku-4.5'],
    ['sonnet', 'anthropic/claude-sonnet-4.6'],
    ['haiku-then-sonnet', 'anthropic/claude-haiku-4.5'],
  ] as const)('uses the right model for %s and reports it', async (mode, model) => {
    reply('{}');
    const { modelUsed } = await interpretMoodboard([image], undefined, mode);
    expect(modelUsed).toBe(model);
    expect(requestBody().model).toBe(model);
  });

  it('sends a cached system prompt listing every enum', async () => {
    reply('{}');
    await interpretMoodboard([image], undefined, 'haiku');
    const body = requestBody();
    expect(body.response_format).toEqual({ type: 'json_object' });
    const [system] = body.messages as Array<{ role: string; content: Array<{ text: string; cache_control: unknown }> }>;
    expect(system.role).toBe('system');
    expect(system.content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(system.content[0].text).toContain(`STYLE: ${ENUM_LIST.style.join(', ')}`);
    expect(system.content[0].text).toContain(`SETTING_TYPES: ${ENUM_LIST.settingType.join(', ')}`);
  });

  it('carries the brief and every attachment as content blocks', async () => {
    reply('{}');
    await interpretMoodboard([image, pdf, { ...image, kind: 'video' as never }], '  70s den ', 'sonnet');
    const [, user] = requestBody().messages as Array<{ content: unknown[] }>;
    expect(user.content).toEqual([
      { type: 'text', text: 'USER BRIEF: 70s den\n\nMoodboard attachments follow.' },
      { type: 'image_url', image_url: { url: image.dataUrl } },
      { type: 'file', file: { filename: 'deck.pdf', file_data: pdf.dataUrl } },
    ]);
  });

  it('asks for a plain interpretation when there is no brief', async () => {
    reply('{}');
    await interpretMoodboard([image], '   ', 'haiku');
    const [, user] = requestBody().messages as Array<{ content: Array<{ text?: string }> }>;
    expect(user.content[0].text).toBe('Interpret the attached moodboard.');
  });

  it('sends the key and the app headers', async () => {
    reply('{}');
    await interpretMoodboard([image], undefined, 'haiku');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer or-key');
    expect(headers['x-title']).toBeTruthy();
    expect(headers['http-referer']).toBeTruthy();
  });

  it('throws with the status and body on an error response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden by policy', { status: 403 }));
    await expect(interpretMoodboard([image], undefined, 'haiku')).rejects.toThrow('OpenRouter 403: forbidden by policy');
  });
});

describe('sanitize', () => {
  it('keeps only enum slugs and labeled entries', async () => {
    reply(JSON.stringify(FULL));
    const { interpretation } = await interpretMoodboard([image], undefined, 'haiku');
    expect(interpretation).toEqual({
      overall: {
        style: ['mid-century-modern'],
        era: '1960s',
        vibes: ['cozy'],
        settingType: ['living-room'],
        summary: 'A warm den.',
      },
      detectedItems: [
        {
          label: 'credenza',
          description: 'long and low',
          style: ['scandinavian'],
          era: '1950s',
          materials: ['walnut'],
          colors: ['brown'],
        },
      ],
      suggestedAdditions: [
        { label: 'arc lamp', reason: 'corner light' },
        { label: 'rug', reason: '' },
      ],
    });
  });

  it('drops an era outside the enum and non-array enum fields', async () => {
    reply(JSON.stringify({ overall: { era: 'medieval', style: 'mid-century-modern', vibes: null }, detectedItems: [{ label: 'x', era: 42 }] }));
    const { interpretation } = await interpretMoodboard([image], undefined, 'haiku');
    expect(interpretation.overall.era).toBeUndefined();
    expect(interpretation.overall.style).toEqual([]);
    expect(interpretation.overall.vibes).toEqual([]);
    expect(interpretation.detectedItems[0]).toEqual({
      label: 'x',
      description: '',
      style: [],
      era: undefined,
      materials: [],
      colors: [],
    });
  });

  it('reads JSON from a markdown fence or from inside prose', async () => {
    reply('```json\n{"overall":{"summary":"fenced"}}\n```');
    expect((await interpretMoodboard([image], undefined, 'haiku')).interpretation.overall.summary).toBe('fenced');

    reply('Here is the analysis: {"overall":{"summary":"prose"}} — done.');
    expect((await interpretMoodboard([image], undefined, 'haiku')).interpretation.overall.summary).toBe('prose');
  });

  it('yields an empty interpretation for non-JSON, non-object or missing content', async () => {
    const empty = {
      overall: { style: [], era: undefined, vibes: [], settingType: [], summary: '' },
      detectedItems: [],
      suggestedAdditions: [],
    };
    reply('I cannot see the image.');
    expect((await interpretMoodboard([image], undefined, 'haiku')).interpretation).toEqual(empty);

    reply('[1,2,3]');
    expect((await interpretMoodboard([image], undefined, 'haiku')).interpretation).toEqual(empty);

    fetchMock.mockResolvedValueOnce(new Response('{"choices":[]}', { status: 200 }));
    expect((await interpretMoodboard([image], undefined, 'haiku')).interpretation).toEqual(empty);
  });
});
