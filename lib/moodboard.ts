import type { Attachment, MoodboardInterpretation, SearchMode } from './types';
import { ENUM_LIST } from './enrichment-enums';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MODEL_BY_MODE: Record<Exclude<SearchMode, 'text'>, string> = {
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-4.6',
  'haiku-then-sonnet': 'anthropic/claude-haiku-4.5', // extraction stage; sonnet runs at rerank in search-modes.ts
};

const SYSTEM = `You are a production designer's eye. The user attaches moodboard images and/or a PDF deck. Identify every distinct prop and furniture piece visible, describe the overall aesthetic, and suggest tasteful additions that would complete the scene.

Output ONLY a JSON object of this exact shape (no markdown, no prose):
{
  "overall": {
    "style": string[],          // pick 0-4 slugs from the STYLE enum
    "era": string,              // single ERA slug, omit if uncertain
    "vibes": string[],          // 0-4 from the VIBES enum
    "settingType": string[],    // 0-3 from the SETTING_TYPES enum
    "summary": string           // one vivid sentence
  },
  "detectedItems": [
    {
      "label": string,                  // a concrete short name, e.g. "tufted cognac chesterfield sofa"
      "description": string,            // 1-2 sentences of distinguishing visual detail
      "style": string[],                // optional, slugs from STYLE
      "era": string,                    // optional, slug from ERA
      "materials": string[],            // 1-4 from MATERIALS
      "colors": string[]                // 1-4 from COLORS
    }
  ],
  "suggestedAdditions": [
    { "label": string, "reason": string }   // 3-6 items NOT visible that complete the scene
  ]
}

Be specific about silhouette, finish, period markers, and color. Pick slugs strictly from these enums (no free text in enum fields):

STYLE: ${ENUM_LIST.style.join(', ')}
ERA: ${ENUM_LIST.era.join(', ')}
MATERIALS: ${ENUM_LIST.materials.join(', ')}
COLORS: ${ENUM_LIST.colors.join(', ')}
VIBES: ${ENUM_LIST.vibes.join(', ')}
SETTING_TYPES: ${ENUM_LIST.settingType.join(', ')}

If the user also typed a text query, treat it as the brief — extract items consistent with both the brief AND the visuals.`;

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

function buildUserContent(query: string | undefined, attachments: Attachment[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const text = query?.trim()
    ? `USER BRIEF: ${query.trim()}\n\nMoodboard attachments follow.`
    : 'Interpret the attached moodboard.';
  blocks.push({ type: 'text', text });
  for (const a of attachments) {
    if (a.kind === 'image') {
      blocks.push({ type: 'image_url', image_url: { url: a.dataUrl } });
    } else if (a.kind === 'pdf') {
      // OpenRouter accepts OpenAI-style file blocks for Anthropic models with PDF support.
      blocks.push({ type: 'file', file: { filename: a.filename, file_data: a.dataUrl } });
    }
  }
  return blocks;
}

function safeParseJson<T = unknown>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // try first { ... last }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

function filterEnum(values: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((v): v is string => typeof v === 'string' && allowed.includes(v));
}

function sanitize(raw: unknown): MoodboardInterpretation {
  const r = (raw ?? {}) as Record<string, unknown>;
  const overall = (r.overall ?? {}) as Record<string, unknown>;
  const detected = Array.isArray(r.detectedItems) ? r.detectedItems : [];
  const adds = Array.isArray(r.suggestedAdditions) ? r.suggestedAdditions : [];
  return {
    overall: {
      style: filterEnum(overall.style, ENUM_LIST.style),
      era: typeof overall.era === 'string' && (ENUM_LIST.era as readonly string[]).includes(overall.era) ? overall.era : undefined,
      vibes: filterEnum(overall.vibes, ENUM_LIST.vibes),
      settingType: filterEnum(overall.settingType, ENUM_LIST.settingType),
      summary: typeof overall.summary === 'string' ? overall.summary : '',
    },
    detectedItems: detected
      .map((d) => {
        const o = (d ?? {}) as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label : '';
        if (!label) return null;
        return {
          label,
          description: typeof o.description === 'string' ? o.description : '',
          style: filterEnum(o.style, ENUM_LIST.style),
          era: typeof o.era === 'string' && (ENUM_LIST.era as readonly string[]).includes(o.era) ? o.era : undefined,
          materials: filterEnum(o.materials, ENUM_LIST.materials),
          colors: filterEnum(o.colors, ENUM_LIST.colors),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    suggestedAdditions: adds
      .map((a) => {
        const o = (a ?? {}) as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label : '';
        if (!label) return null;
        return { label, reason: typeof o.reason === 'string' ? o.reason : '' };
      })
      .filter((x): x is { label: string; reason: string } => x !== null),
  };
}

export async function interpretMoodboard(
  attachments: Attachment[],
  query: string | undefined,
  mode: Exclude<SearchMode, 'text'>,
): Promise<{ interpretation: MoodboardInterpretation; modelUsed: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const model = MODEL_BY_MODE[mode];

  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
      'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2400,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        },
        { role: 'user', content: buildUserContent(query, attachments) },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  const parsed = safeParseJson(text) ?? {};
  return { interpretation: sanitize(parsed), modelUsed: model };
}
