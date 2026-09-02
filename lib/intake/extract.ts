/**
 * Project intake: turning what the user says about a production into profile
 * fields. The LLM's only job here is understanding; the requirements engine
 * decides what the profile means.
 *
 * Env:
 *   INTAKE_PROVIDER=mock|openrouter   default: openrouter when OPENROUTER_API_KEY
 *                                     is set, otherwise mock
 *   INTAKE_MODEL                      OpenRouter model id, default Claude Sonnet
 *
 * The mock is a keyword extractor good enough to demo the whole loop with zero
 * secrets: the Brooklyn indie example produces the same profile either way.
 */

import {
  YES_NO_GAP_FIELDS,
  mergeProjectProfile,
  normalizeProjectProfile,
  profileFacts,
  type ProfileGap,
  type ProjectProfile,
} from '../project-profile';
import { PRODUCTION_TYPES } from '../accounts';

export type IntakeMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** Gap keys the assistant asked about, so a short answer can be routed back. */
  questionKeys?: string[];
};

export type ExtractInput = {
  projectName: string;
  profile: ProjectProfile;
  transcript: IntakeMessage[];
  message: string;
  /** What the profile still leaves open, most important first. */
  gaps: ProfileGap[];
};

export type ExtractOutput = {
  /** Facts the message states, as a profile patch. Empty when it states none. */
  patch: ProjectProfile;
  /** The assistant's reply. Absent means: compose one from the patch and the open gaps. */
  reply?: string;
  /** Gap keys the reply asks about. */
  askedKeys: string[];
};

export interface IntakeExtractor {
  readonly name: 'mock' | 'openrouter';
  extract(input: ExtractInput): Promise<ExtractOutput>;
}

/** How many open questions one reply may carry. */
export const MAX_QUESTIONS_PER_TURN = 3;

// ---- short answers to the previous question, resolved in code for every provider ----

const YES = /^\s*(yes|yep|yeah|yup|correct|we do|there (is|are)|it does)\b/i;
const NO = /^\s*(no|nope|none|nah|not really|we don'?t|it doesn'?t)\b/i;

/**
 * "yes", "no", or a bare number answering the assistant's last question.
 * Deterministic so a one-word answer never depends on the model reading the
 * transcript correctly.
 */
export function shortAnswerPatch(message: string, questionKeys: string[] | undefined): ProjectProfile {
  const key = questionKeys?.[0];
  if (!key) return {};
  const text = message.trim();

  const yesNoField = YES_NO_GAP_FIELDS[key];
  if (yesNoField) {
    const value = YES.test(text) ? true : NO.test(text) ? false : undefined;
    if (value !== undefined) return setPath({}, yesNoField, value);
  }

  const number = text.match(/^\s*(\d{1,4})\s*(people|crew|days?|locations?)?\s*\.?\s*$/i);
  if (number) {
    const n = Number(number[1]);
    if (key === 'crew.count') return { crew: { count: n } };
    if (key === 'schedule') return { schedule: { shootDays: n } };
  }
  if (key === 'crew.count' && NO.test(text)) return { crew: { count: 0 } };
  if (key === 'rentals' && NO.test(text)) return { rentals: { props: false, furniture: false, equipment: false } };
  if (key === 'risks' && NO.test(text)) {
    return { risks: { stunts: false, specialEffects: false, pyrotechnics: false, weapons: false, animals: false, drones: false } };
  }
  return {};
}

function setPath(target: ProjectProfile, path: string, value: unknown): ProjectProfile {
  const out: Record<string, unknown> = { ...target };
  const [section, field] = path.split('.');
  out[section] = { ...((out[section] as Record<string, unknown>) ?? {}), [field]: value };
  return normalizeProjectProfile(out);
}

// ---- the reply, when the provider leaves it to us ----

/** "Noted: Film, 10 days, Brooklyn. A few things to pin down: …" */
export function composeReply(patch: ProjectProfile, asked: ProfileGap[]): string {
  const facts = profileFacts(patch).slice(0, 5);
  const parts: string[] = [];
  if (facts.length > 0) {
    parts.push(`Noted: ${facts.map((f) => (f.label === 'Type' ? f.value : `${f.label.toLowerCase()} ${f.value}`)).join(', ')}.`);
  } else {
    parts.push('Understood.');
  }
  if (asked.length === 0) {
    parts.push('That covers what the checklist needs. It is below, and it updates as you tell me more.');
  } else if (asked.length === 1) {
    parts.push(asked[0].question);
  } else {
    parts.push(`A few things to pin down: ${asked.map((g, i) => `${i + 1}) ${g.question}`).join(' ')}`);
  }
  return parts.join(' ');
}

// ---- mock extractor ----

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  a: 1, an: 1, single: 1, couple: 2, few: 3, several: 3, multiple: 3,
};

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  return WORD_NUMBERS[lower];
}

const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an|single|couple|few|several|multiple)';

const CITIES: Array<[RegExp, { city: string; region?: string; country?: string }]> = [
  [/\bbrooklyn\b/i, { city: 'Brooklyn', region: 'NY' }],
  [/\b(nyc|new york|manhattan|queens)\b/i, { city: 'New York', region: 'NY' }],
  [/\b(los angeles|l\.a\.|\bla\b|hollywood)\b/i, { city: 'Los Angeles', region: 'CA' }],
  [/\bburbank\b/i, { city: 'Burbank', region: 'CA' }],
  [/\batlanta\b/i, { city: 'Atlanta', region: 'GA' }],
  [/\bchicago\b/i, { city: 'Chicago', region: 'IL' }],
  [/\bausti?n\b/i, { city: 'Austin', region: 'TX' }],
  [/\bmiami\b/i, { city: 'Miami', region: 'FL' }],
  [/\bnew orleans\b/i, { city: 'New Orleans', region: 'LA' }],
  [/\bvancouver\b/i, { city: 'Vancouver', region: 'BC', country: 'Canada' }],
  [/\btoronto\b/i, { city: 'Toronto', region: 'ON', country: 'Canada' }],
  [/\blondon\b/i, { city: 'London', country: 'UK' }],
];

const TYPE_PATTERNS: Array<[RegExp, (typeof PRODUCTION_TYPES)[number]]> = [
  [/\bmusic video\b/i, 'music_video'],
  [/\b(commercial|spot|brand film|ad campaign|advert)\b/i, 'commercial'],
  [/\b(tv|television|series|episode|pilot|streaming show)\b/i, 'television'],
  [/\b(editorial|photo ?shoot|lookbook|fashion shoot|still shoot)\b/i, 'editorial'],
  [/\b(experiential|activation|pop-?up|installation)\b/i, 'experiential'],
  [/\b(event|gala|launch party|conference|wedding|premiere party)\b/i, 'event'],
  [/\b(theat(er|re)|stage play|play)\b/i, 'theater'],
  [/\b(film|feature|short|movie|documentary|doc)\b/i, 'film'],
];

const RISK_WORDS: Record<string, string> = {
  stunts: 'stunts?',
  specialEffects: '(?:special effects|sfx|practical effects|effects)',
  pyrotechnics: '(?:pyro|pyrotechnics?|fire|explosions?|squibs?)',
  weapons: '(?:weapons?|guns?|firearms?|knives|blades?)',
  animals: '(?:animals?|dogs?|horses?|cats?|livestock)',
  drones: 'drones?',
};

/** Keyword extraction, exported for tests. */
export function heuristicPatch(message: string): ProjectProfile {
  const m = message;
  const has = (re: RegExp) => re.test(m);
  const patch: Record<string, unknown> = {};

  for (const [re, type] of TYPE_PATTERNS) {
    if (re.test(m)) {
      patch.productionType = type;
      break;
    }
  }

  const days = m.match(new RegExp(`\\b${NUM}[- ]day\\b`, 'i')) ?? m.match(new RegExp(`\\b${NUM}\\s+(?:shoot(?:ing)?\\s+)?days\\b`, 'i'));
  const dates = m.match(/(\d{4}-\d{2}-\d{2})(?:\s*(?:to|through|-|–)\s*(\d{4}-\d{2}-\d{2}))?/);
  const schedule = { shootDays: num(days?.[1]), start: dates?.[1], end: dates?.[2] };
  if (schedule.shootDays || schedule.start) patch.schedule = schedule;

  const locations: Record<string, unknown> = {};
  for (const [re, where] of CITIES) {
    if (re.test(m)) {
      Object.assign(locations, where);
      break;
    }
  }
  const locCount = m.match(new RegExp(`\\b${NUM}\\s+(?:different\\s+|practical\\s+)?locations?\\b`, 'i'));
  if (locCount) locations.count = num(locCount[1]);
  const kinds: string[] = [];
  if (has(/\bstudio|sound ?stage\b/i)) kinds.push('studio');
  if (has(/\bpractical location|apartment|house|home|office|restaurant|bar\b/i)) kinds.push('practical');
  if (has(/\bvenue\b/i)) kinds.push('venue');
  if (has(/\bexterior|outdoor|outside\b/i)) kinds.push('exterior');
  if (has(/\bstreet|sidewalk|park\b|public (property|space|street)|subway/i)) {
    kinds.push('public');
    locations.publicProperty = true;
  } else if (has(/\b(no|nothing|not) (on )?(public|streets?)\b/i)) {
    locations.publicProperty = false;
  }
  if (kinds.length > 0) locations.kinds = kinds;
  if (Object.keys(locations).length > 0) patch.locations = locations;

  const venue: Record<string, unknown> = {};
  const venueName = m.match(/\b(?:at|venue is|venue:)\s+(?:the\s+)?([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})\b/);
  if (venueName && has(/\bvenue\b/i)) venue.name = venueName[1];
  if (has(/\b(venue|they|location) (requires?|needs?|wants?|asks? for)\b.*\b(coi|certificate of insurance|insurance certificate)\b/i)) venue.requiresCoi = true;
  if (has(/\b(install|strike|load-?in|load-?out)\b/i)) venue.installStrike = true;
  if (Object.keys(venue).length > 0) patch.venue = venue;

  const crew = m.match(new RegExp(`\\b${NUM}\\s+(?:person\\s+|people\\s+|member\\s+)?crew\\b`, 'i')) ?? m.match(new RegExp(`\\b${NUM}\\s+crew\\s+members?\\b`, 'i')) ?? m.match(/\bcrew of (\d+)\b/i);
  const crewSection: Record<string, unknown> = {};
  if (crew) crewSection.count = num(crew[1]);
  if (has(/\b(freelance|contractors?|1099|day ?players?)\b/i)) crewSection.contractors = true;
  if (has(/\bnon-?union\b/i)) crewSection.union = false;
  else if (has(/\bunion\b/i)) crewSection.union = true;
  if (Object.keys(crewSection).length > 0) patch.crew = crewSection;

  const cast: Record<string, unknown> = {};
  const castCount = m.match(new RegExp(`\\b${NUM}\\s+(?:\\w+\\s+)?(?:actors?|cast members?|talent|performers?)\\b`, 'i'));
  if (castCount) cast.count = num(castCount[1]);
  if (has(/\b(no|without|zero) (minors|kids|children|child actors)\b/i)) cast.minors = false;
  else if (has(/\b(child|children|minor|kid|teen|under 18|baby|infant)\b/i)) cast.minors = true;
  if (Object.keys(cast).length > 0) patch.cast = cast;

  const rentals: Record<string, unknown> = {};
  const renting = has(/\b(rent|rental|renting|rented|hire|hiring|sourcing|pull(ing)?)\b/i);
  if (renting) {
    if (has(/\bprops?\b/i)) rentals.props = true;
    if (has(/\bfurniture|set dressing|d[ée]cor\b/i)) rentals.furniture = true;
    if (has(/\b(equipment|camera|lighting|grip|lenses|gear)\b/i)) rentals.equipment = true;
  }
  if (has(/\b(no|not|nothing) (rent|rentals|renting)\b/i)) {
    rentals.props = false;
    rentals.furniture = false;
    rentals.equipment = false;
  }
  const vendorCount = m.match(new RegExp(`\\b${NUM}\\s+(?:different\\s+)?(?:vendors|prop houses|rental houses|suppliers)\\b`, 'i'));
  if (vendorCount) rentals.vendorCount = num(vendorCount[1]);
  if (Object.keys(rentals).length > 0) patch.rentals = rentals;

  const vehicles: Record<string, unknown> = {};
  if (has(/\b(box truck|cube truck|truck|cargo van|sprinter|production vehicle|grip truck)\b/i)) vehicles.rentedTrucks = true;
  if (has(/\bpicture (car|vehicle)s?\b|\bhero car\b/i)) vehicles.pictureVehicles = true;
  if (Object.keys(vehicles).length > 0) patch.vehicles = vehicles;

  const risks: Record<string, unknown> = {};
  for (const [key, word] of Object.entries(RISK_WORDS)) {
    if (new RegExp(`\\b(?:no|without|zero|not any)\\s+(?:[\\w,]+\\s+){0,3}?${word}\\b`, 'i').test(m)) risks[key] = false;
    else if (new RegExp(`\\b${word}\\b`, 'i').test(m)) risks[key] = true;
  }
  if (Object.keys(risks).length > 0) patch.risks = risks;

  const client: Record<string, unknown> = {};
  const clientName = m.match(/\b(?:for|client is|client:)\s+(?:the\s+)?([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,2})\b/);
  const clientWork = patch.productionType === 'commercial' || patch.productionType === 'experiential' || patch.productionType === 'event';
  if (has(/\b(client|agency|brand)\b/i) || (clientWork && clientName)) {
    client.billable = true;
    if (clientName) client.name = clientName[1];
  }
  if (Object.keys(client).length > 0) patch.client = client;

  return normalizeProjectProfile(patch);
}

export class MockIntakeExtractor implements IntakeExtractor {
  readonly name = 'mock' as const;

  async extract(input: ExtractInput): Promise<ExtractOutput> {
    const patch = heuristicPatch(input.message);
    const remaining = gapsAfter(input, patch);
    return { patch, askedKeys: remaining.slice(0, MAX_QUESTIONS_PER_TURN).map((g) => g.key) };
  }
}

function gapsAfter(input: ExtractInput, patch: ProjectProfile): ProfileGap[] {
  const merged = mergeProjectProfile(input.profile, patch);
  return input.gaps.filter((g) => !answered(merged, g.key));
}

function answered(p: ProjectProfile, key: string): boolean {
  switch (key) {
    case 'productionType':
      return Boolean(p.productionType);
    case 'schedule':
      return Boolean(p.schedule?.start || p.schedule?.shootDays);
    case 'rentals':
      return p.rentals?.props !== undefined || p.rentals?.furniture !== undefined || p.rentals?.equipment !== undefined;
    case 'risks':
      return Boolean(p.risks && Object.values(p.risks).some((v) => v !== undefined));
    default: {
      const [section, field] = key.split('.');
      const s = (p as Record<string, unknown>)[section];
      return Boolean(s && typeof s === 'object' && (s as Record<string, unknown>)[field] !== undefined);
    }
  }
}

// ---- OpenRouter extractor ----

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

const PROFILE_SHAPE = `{
  "productionType": "film" | "television" | "commercial" | "music_video" | "editorial" | "event" | "experiential" | "theater" | "other",
  "summary": string,                       // one sentence in the user's own words
  "schedule": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "shootDays": number },
  "locations": { "count": number, "city": string, "region": string, "country": string,
                 "kinds": ("studio" | "practical" | "venue" | "exterior" | "public")[], "publicProperty": boolean },
  "venue": { "name": string, "requiresCoi": boolean, "installStrike": boolean },
  "crew": { "count": number, "contractors": boolean, "union": boolean },
  "cast": { "count": number, "minors": boolean },
  "rentals": { "props": boolean, "furniture": boolean, "equipment": boolean, "vendorCount": number, "vendors": string[] },
  "vehicles": { "rentedTrucks": boolean, "pictureVehicles": boolean },
  "risks": { "stunts": boolean, "specialEffects": boolean, "pyrotechnics": boolean, "weapons": boolean, "animals": boolean, "drones": boolean },
  "client": { "name": string, "billable": boolean },
  "facts": string[]                         // short facts that fit no field above
}`;

const SYSTEM = `You are the intake coordinator for Prop Haus, a production sourcing platform. A user is describing a production. Your job is to understand what they said and turn it into structured project facts. You never decide which paperwork they need; a separate rules engine does that from the facts.

Respond with ONLY a JSON object: { "patch": <profile patch>, "reply": string, "asked": string[] }

patch: a partial profile of this shape, containing ONLY facts the user's latest message states or clearly implies. Omit every key you are not sure about. A boolean false means the user said no, not that they did not mention it.
${PROFILE_SHAPE}

reply: 2–4 short sentences in a calm, production-set voice. Acknowledge what you learned in plain words, then ask up to ${MAX_QUESTIONS_PER_TURN} of the OPEN QUESTIONS listed in the user turn, skipping any your patch answers. Ask nothing else. Never list documents, never say something is legally required, never give legal or insurance advice. Sentence case. No exclamation points, no em-dashes.

asked: the keys of the open questions your reply asks, in order.`;

function safeParseJson<T = unknown>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
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

export class OpenRouterIntakeExtractor implements IntakeExtractor {
  readonly name = 'openrouter' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.INTAKE_MODEL || DEFAULT_MODEL,
  ) {}

  async extract(input: ExtractInput): Promise<ExtractOutput> {
    const history = input.transcript.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const userTurn = [
      `PROJECT: ${input.projectName}`,
      `CURRENT PROFILE: ${JSON.stringify(input.profile)}`,
      `OPEN QUESTIONS:\n${input.gaps.map((g) => `- ${g.key}: ${g.question}`).join('\n') || '- none'}`,
      `LATEST MESSAGE: ${input.message}`,
    ].join('\n\n');

    const res = await fetch(OR_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        'http-referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3017',
        'x-title': process.env.OPENROUTER_APP_NAME || 'prop-haus',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1200,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }] },
          ...history,
          { role: 'user', content: userTurn },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = safeParseJson<{ patch?: unknown; reply?: unknown; asked?: unknown }>(data.choices?.[0]?.message?.content ?? '') ?? {};

    const patch = normalizeProjectProfile(parsed.patch);
    const gapKeys = new Set(input.gaps.map((g) => g.key));
    const asked = Array.isArray(parsed.asked)
      ? parsed.asked.filter((k): k is string => typeof k === 'string' && gapKeys.has(k)).slice(0, MAX_QUESTIONS_PER_TURN)
      : [];
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 1200) : undefined;
    return { patch, reply, askedKeys: asked };
  }
}

export function intakeProvider(): 'mock' | 'openrouter' {
  const configured = process.env.INTAKE_PROVIDER;
  if (configured === 'mock' || configured === 'openrouter') return configured;
  return process.env.OPENROUTER_API_KEY ? 'openrouter' : 'mock';
}

/** The configured extractor. OpenRouter only when selected and a key is present. */
export function intakeExtractor(): IntakeExtractor {
  const key = process.env.OPENROUTER_API_KEY;
  if (intakeProvider() === 'openrouter' && key) return new OpenRouterIntakeExtractor(key);
  return new MockIntakeExtractor();
}
