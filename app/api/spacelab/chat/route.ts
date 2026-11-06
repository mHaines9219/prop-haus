import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentOrgId } from '@/lib/session';
import { ChatTurnSchema, getSceneChatProvider } from '@/lib/spacelab/studio/chat';
import { SceneSchema } from '@/lib/spacelab/studio/scene';

/**
 * POST /api/spacelab/chat — one turn of the Space Lab conversation.
 *
 * The client owns the scene and sends it with every turn; the answer is a
 * reply plus the commands to apply. The mock provider answers anyone, so
 * the studio demos signed out. A real OpenRouter key costs money per call,
 * so with one configured the route wants a session.
 *
 *   200 { reply, commands, provider }
 *   400 { error: 'invalid' }
 *   401 { error: 'not signed in' }       only with a real provider
 *   429 { error: 'rate_limited' }
 *   502 { error: 'provider_failed' }
 */

const BodySchema = z.object({
  scene: SceneSchema,
  history: z.array(ChatTurnSchema).max(40).default([]),
  message: z.string().trim().min(1).max(1000),
});

// A model call costs money, so cap turns per caller: 30 a minute, per org
// or, signed out on the mock, per address. In-memory, per server instance.
const WINDOW_MS = 60 * 1000;
const MAX_TURNS = 30;
const turns = new Map<string, number[]>();

function rateLimited(key: string, now: number): boolean {
  const recent = (turns.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  turns.set(key, recent);
  return recent.length > MAX_TURNS;
}

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const provider = getSceneChatProvider();
  const orgId = await currentOrgId();
  if (provider.name !== 'mock' && !orgId) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }
  if (rateLimited(orgId ?? clientIp(req), Date.now())) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  try {
    const { reply, commands } = await provider.respond(parsed.data);
    return NextResponse.json({ reply, commands, provider: provider.name });
  } catch (err) {
    console.error('[spacelab/chat]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'provider_failed' }, { status: 502 });
  }
}
