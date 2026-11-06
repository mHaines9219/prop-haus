import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeholderScene } from '@/lib/spacelab/studio/scene';

const session = vi.hoisted(() => ({ orgId: null as string | null }));
vi.mock('@/lib/session', () => ({ currentOrgId: async () => session.orgId }));

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return POST(new Request('http://x/api/spacelab/chat', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '10.0.0.1' } }));
};

describe('POST /api/spacelab/chat', () => {
  beforeEach(() => {
    session.orgId = null;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('answers a signed-out user through the mock', async () => {
    const res = await post({ scene: placeholderScene(), history: [], message: 'put the armchair against the back wall' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('mock');
    expect(body.commands).toEqual([{ type: 'place', itemId: 'armchair', x: 9, z: 1.4 }]);
    expect(body.reply).toMatch(/Placed/);
  });

  it('rejects a malformed scene', async () => {
    const res = await post({ scene: { room: {} }, message: 'hi' });
    expect(res.status).toBe(400);
  });

  it('wants a session once a real key is set', async () => {
    process.env.OPENROUTER_API_KEY = 'k';
    const res = await post({ scene: placeholderScene(), history: [], message: 'hi' });
    expect(res.status).toBe(401);
  });
});
