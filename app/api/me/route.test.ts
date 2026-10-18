import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());

import { signIn, signOut } from '@/test/mocks/session';
import { GET } from './route';

// Who am I, for the client: always 200, effective and real plan, admin flag, no ids.

describe('GET /api/me', () => {
  beforeEach(() => signOut());

  it('answers a signed-out visitor as the free tier', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await readJson(res)).toEqual({ signedIn: false, plan: 'free', actualPlan: 'free', isAdmin: false });
  });

  it('reports the effective plan beside the real one, and nothing identifying', async () => {
    signIn({ plan: 'free', actualPlan: 'pro', isAdmin: true, email: 'mhaines9219@gmail.com' });
    const body = await readJson<Record<string, unknown>>(await GET());
    expect(body).toEqual({ signedIn: true, plan: 'free', actualPlan: 'pro', isAdmin: true });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('orgId');
  });
});
