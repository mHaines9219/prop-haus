import { describe, expect, it, vi } from 'vitest';
import { createOpenRouterSceneChat, getSceneChatProvider, mockSceneChat, systemPrompt } from './chat';
import { applyCommands, placeholderScene } from './scene';

const ask = (message: string, scene = placeholderScene()) => mockSceneChat.respond({ scene, history: [], message });

describe('mockSceneChat', () => {
  it('places an unplaced item against a named wall', async () => {
    const res = await ask('put the armchair against the right wall');
    expect(res.commands).toEqual([{ type: 'place', itemId: 'armchair', x: 18 - 1.4, z: 6 }]);
    expect(res.reply).toMatch(/Placed the rattan armchair against the right wall/);
  });

  it('moves a placed item into a corner', async () => {
    const res = await ask('move the sofa to the back left corner');
    expect(res.commands).toEqual([{ type: 'move', itemId: 'sofa', x: 3.5, z: 1.5 }]);
  });

  it('puts one item next to another', async () => {
    const res = await ask('lamp to the left of the sofa');
    expect(res.commands).toEqual([{ type: 'move', itemId: 'lamp', x: 9 - 3.5 - 0.6 - 0.5, z: 1.5 }]);
  });

  it('rotates, removes and resizes', async () => {
    expect((await ask('rotate the coffee table')).commands).toEqual([{ type: 'rotate', itemId: 'coffee-table', rotation: 90 }]);
    expect((await ask('remove the lamp')).commands).toEqual([{ type: 'remove', itemId: 'lamp' }]);
    expect((await ask('make the room 20 by 14')).commands).toEqual([{ type: 'resize_room', width: 20, depth: 14 }]);
  });

  it('asks for a piece when none is named, and a spot when a placed piece has none', async () => {
    expect((await ask('make it cozier')).commands).toEqual([]);
    const res = await ask('the sofa');
    expect(res.commands).toEqual([]);
    expect(res.reply).toMatch(/Where should the tufted velvet sofa go/);
  });

  it('only emits commands the reducer accepts', async () => {
    const scene = placeholderScene();
    for (const message of ['armchair back wall', 'ficus front right', 'rug in the middle', 'turn the rug', 'remove the ficus']) {
      const res = await ask(message, scene);
      expect(applyCommands(scene, res.commands).rejected).toEqual([]);
    }
  });
});

describe('createOpenRouterSceneChat', () => {
  const answer = (content: string) =>
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));

  it('sends the scene as the system prompt and parses the JSON answer', async () => {
    const fetchImpl = answer('{"reply":"Done.","commands":[{"type":"move","itemId":"sofa","x":9,"z":10}]}');
    const provider = createOpenRouterSceneChat({ apiKey: 'k', model: 'test/model', fetchImpl });
    const scene = placeholderScene();
    const res = await provider.respond({ scene, history: [{ role: 'user', text: 'hi' }], message: 'sofa forward' });
    expect(res).toEqual({ reply: 'Done.', commands: [{ type: 'move', itemId: 'sofa', x: 9, z: 10 }] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('test/model');
    expect(body.messages[0]).toEqual({ role: 'system', content: systemPrompt(scene) });
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'sofa forward' });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });

  it('drops commands the scene rejects and keeps the reply', async () => {
    const fetchImpl = answer('```json\n{"reply":"Sure.","commands":[{"type":"move","itemId":"ghost","x":1,"z":1},{"type":"remove","itemId":"lamp"}]}\n```');
    const provider = createOpenRouterSceneChat({ apiKey: 'k', fetchImpl });
    const res = await provider.respond({ scene: placeholderScene(), history: [], message: 'x' });
    expect(res).toEqual({ reply: 'Sure.', commands: [{ type: 'remove', itemId: 'lamp' }] });
  });

  it('turns a non-JSON answer into a plain reply', async () => {
    const provider = createOpenRouterSceneChat({ apiKey: 'k', fetchImpl: answer('Which sofa?') });
    const res = await provider.respond({ scene: placeholderScene(), history: [], message: 'x' });
    expect(res).toEqual({ reply: 'Which sofa?', commands: [] });
  });

  it('throws on a failed call', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    const provider = createOpenRouterSceneChat({ apiKey: 'k', fetchImpl });
    await expect(provider.respond({ scene: placeholderScene(), history: [], message: 'x' })).rejects.toThrow('openrouter 401');
  });
});

describe('getSceneChatProvider', () => {
  it('is the mock without a key and OpenRouter with one', () => {
    expect(getSceneChatProvider({}).name).toBe('mock');
    expect(getSceneChatProvider({ OPENROUTER_API_KEY: 'k' }).name).toBe('openrouter');
  });
});
