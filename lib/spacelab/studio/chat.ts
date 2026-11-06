import { z } from 'zod';
import {
  anchorPosition,
  applyCommands,
  footprint,
  SceneCommandSchema,
  type Scene,
  type SceneCommand,
  type StudioItem,
} from './scene';

/**
 * The chat that drives the scene. The user types a sentence; the provider
 * answers with a short reply and the `SceneCommand`s that carry it out. The
 * client applies the commands with `applyCommands`, so the model never
 * touches the scene directly and can never produce a state the reducer
 * would not.
 *
 * Two providers:
 *   openrouter  any chat model on OpenRouter, chosen with OPENROUTER_MODEL.
 *               Needs OPENROUTER_API_KEY. Asked for JSON, parsed at the
 *               boundary, and a reply that fails to parse becomes a plain
 *               message with no commands rather than an error.
 *   mock        a rule-based parser that understands "put the sofa against
 *               the back wall", "move the lamp next to the sofa", "rotate the
 *               armchair", "remove the rug", "make the room 20 by 14". No
 *               secrets, no cost, and the demo works without a key.
 */

export type ChatTurn = { role: 'user' | 'model'; text: string };

export type SceneChatRequest = {
  scene: Scene;
  history: ChatTurn[];
  message: string;
};

export type SceneChatResponse = {
  reply: string;
  commands: SceneCommand[];
};

export interface SceneChatProvider {
  readonly name: 'openrouter' | 'mock';
  respond(req: SceneChatRequest): Promise<SceneChatResponse>;
}

export const ChatTurnSchema = z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) });

// ---------------------------------------------------------------------------
// Mock: a handful of patterns, enough to move furniture around by hand.
// ---------------------------------------------------------------------------

type Anchor = 'back' | 'front' | 'left' | 'right' | 'center';

const ANCHOR_WORDS: [RegExp, Anchor][] = [
  [/\b(back|far|rear)\b/, 'back'],
  [/\b(front|near)\b/, 'front'],
  [/\bleft\b/, 'left'],
  [/\bright\b/, 'right'],
  [/\b(middle|center|centre)\b/, 'center'],
];

/** The item whose name shares the most words with the sentence. */
function findItem(items: StudioItem[], text: string, exclude?: StudioItem): StudioItem | undefined {
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
  let best: { item: StudioItem; score: number } | undefined;
  for (const item of items) {
    if (item === exclude) continue;
    const nameWords = item.name.toLowerCase().match(/[a-z]+/g) ?? [];
    const score = nameWords.filter((w) => w.length > 2 && words.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item;
}

export const mockSceneChat: SceneChatProvider = {
  name: 'mock',
  async respond({ scene, message }) {
    const text = message.toLowerCase();

    const roomMatch = text.match(/room\D*(\d+(?:\.\d+)?)\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)/);
    if (roomMatch) {
      const width = Number(roomMatch[1]);
      const depth = Number(roomMatch[2]);
      return { reply: `Room is now ${width} by ${depth} feet.`, commands: [{ type: 'resize_room', width, depth }] };
    }

    const relative = text.match(/\b(next to|beside|by|near|left of|right of|in front of|behind)\b(.*)$/);
    const item = (relative && findItem(scene.items, text.slice(0, relative.index))) || findItem(scene.items, text);
    if (!item) {
      return {
        reply: 'Name a piece from the list and where it goes. For example, "put the sofa against the back wall".',
        commands: [],
      };
    }
    const placed = scene.placements[item.id];

    if (/\b(remove|take out|take away|delete|get rid)\b/.test(text)) {
      return placed
        ? { reply: `Took the ${item.name.toLowerCase()} out of the room.`, commands: [{ type: 'remove', itemId: item.id }] }
        : { reply: `The ${item.name.toLowerCase()} is not in the room.`, commands: [] };
    }

    if (/\b(rotate|turn|spin)\b/.test(text)) {
      if (!placed) return { reply: `Place the ${item.name.toLowerCase()} first, then I can turn it.`, commands: [] };
      const rotation = (placed.rotation + 90) % 360;
      return { reply: `Turned the ${item.name.toLowerCase()} a quarter turn.`, commands: [{ type: 'rotate', itemId: item.id, rotation }] };
    }

    const other = relative ? findItem(scene.items, relative[2], item) : undefined;
    const fp = footprint(item, placed?.rotation ?? 0);
    let target: { x: number; z: number } | undefined;
    let where = '';
    if (other && scene.placements[other.id]) {
      const o = scene.placements[other.id];
      const ofp = footprint(other, o.rotation);
      const rel = relative![1];
      const gap = 0.5;
      target =
        rel === 'left of'
          ? { x: o.x - ofp.w / 2 - fp.w / 2 - gap, z: o.z }
          : rel === 'right of'
            ? { x: o.x + ofp.w / 2 + fp.w / 2 + gap, z: o.z }
            : rel === 'in front of'
              ? { x: o.x, z: o.z + ofp.d / 2 + fp.d / 2 + gap }
              : rel === 'behind'
                ? { x: o.x, z: o.z - ofp.d / 2 - fp.d / 2 - gap }
                : { x: o.x + ofp.w / 2 + fp.w / 2 + gap, z: o.z };
      where = `${rel} the ${other.name.toLowerCase()}`;
    } else {
      const anchors = ANCHOR_WORDS.filter(([re]) => re.test(text)).map(([, a]) => a);
      if (anchors.length) {
        const first = anchorPosition(scene.room, fp, anchors[0]);
        const second = anchors[1] ? anchorPosition(scene.room, fp, anchors[1]) : undefined;
        target = second
          ? {
              x: anchors[0] === 'left' || anchors[0] === 'right' ? first.x : second.x,
              z: anchors[0] === 'back' || anchors[0] === 'front' ? first.z : second.z,
            }
          : first;
        where = anchors.length > 1 ? `in the ${anchors.join(' ')} corner` : anchors[0] === 'center' ? 'in the middle' : `against the ${anchors[0]} wall`;
      }
    }

    if (!target) {
      if (placed) return { reply: `Where should the ${item.name.toLowerCase()} go? Try "against the back wall" or "next to the sofa".`, commands: [] };
      target = anchorPosition(scene.room, fp, 'center');
      where = 'in the middle';
    }

    const command: SceneCommand = placed
      ? { type: 'move', itemId: item.id, ...target }
      : { type: 'place', itemId: item.id, ...target };
    const verb = placed ? 'Moved' : 'Placed';
    return { reply: `${verb} the ${item.name.toLowerCase()} ${where}.`, commands: [command] };
  },
};

// ---------------------------------------------------------------------------
// OpenRouter: any chat model, asked for JSON.
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

const ModelAnswerSchema = z.object({
  reply: z.string().max(2000),
  commands: z.array(SceneCommandSchema).max(20).default([]),
});

/** The scene, written out for the model. */
export function describeScene(scene: Scene): string {
  const { room } = scene;
  const lines = scene.items.map((item) => {
    const p = scene.placements[item.id];
    const size = `${item.size.w}×${item.size.d}×${item.size.h} ft (w×d×h)`;
    const where = p ? `placed at x=${p.x}, z=${p.z}, rotation=${p.rotation}` : 'not in the room';
    return `- id "${item.id}": ${item.name} (${item.vendor}), ${size}, ${where}`;
  });
  return [`Room: ${room.width} ft wide (x), ${room.depth} ft deep (z), ${room.height} ft high.`, 'Items:', ...lines].join('\n');
}

export function systemPrompt(scene: Scene): string {
  return [
    'You arrange furniture in a 3D room for a film set decorator. The user talks; you answer briefly and emit commands.',
    'Coordinates are feet. x runs along the back wall from the left wall (0) to the right wall (room width). z runs from the back wall (0) toward the viewer (room depth). A position is the centre of the item footprint. rotation is degrees clockwise from above; 0 faces the viewer, 90 faces the left wall.',
    'Keep items inside the room and off each other. Against a wall means the footprint touches it.',
    'Commands: {"type":"place","itemId","x","z","rotation"?} for an item not in the room, {"type":"move","itemId","x","z"}, {"type":"rotate","itemId","rotation"}, {"type":"remove","itemId"}, {"type":"resize_room","width","depth"}.',
    'Answer with JSON only: {"reply": string, "commands": Command[]}. Use the item ids exactly as given. If the request is unclear, ask in "reply" and send no commands.',
    '',
    describeScene(scene),
  ].join('\n');
}

export function createOpenRouterSceneChat(opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): SceneChatProvider {
  const model = opts.model ?? DEFAULT_OPENROUTER_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: 'openrouter',
    async respond({ scene, history, message }) {
      const res = await doFetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          'content-type': 'application/json',
          'x-title': 'Prop Haus Space Lab',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt(scene) },
            ...history.slice(-12).map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text })),
            { role: 'user', content: message },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openrouter ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? '';
      const parsed = ModelAnswerSchema.safeParse(tryJson(content));
      if (!parsed.success) return { reply: content.trim() || 'I did not get that. Try again?', commands: [] };
      // Drop commands the scene would reject, so the client applies only real moves.
      const { rejected } = applyCommands(scene, parsed.data.commands);
      const bad = new Set(rejected.map((r) => r.command));
      return { reply: parsed.data.reply, commands: parsed.data.commands.filter((c) => !bad.has(c)) };
    },
  };
}

function tryJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * OPENROUTER_API_KEY set → OpenRouter, with OPENROUTER_MODEL or the default.
 * Otherwise the mock. The route reports which one answered.
 */
export function getSceneChatProvider(env: Record<string, string | undefined> = process.env): SceneChatProvider {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return mockSceneChat;
  return createOpenRouterSceneChat({ apiKey, model: env.OPENROUTER_MODEL?.trim() || undefined });
}
