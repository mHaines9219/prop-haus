import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());

import { signIn, signOut } from '@/test/mocks/session';
import { POST } from './route';

// The masquerade switch: admins only; writes or clears an httpOnly cookie.

function setCookie(res: Response): string {
  return res.headers.get('set-cookie') ?? '';
}

describe('POST /api/admin/view-as', () => {
  beforeEach(() => signIn({ isAdmin: true, email: 'mhaines9219@gmail.com', plan: 'pro', actualPlan: 'pro' }));

  it('401 signed out, 403 for a member', async () => {
    signOut();
    expect((await POST(jsonRequest('/api/admin/view-as', { plan: 'free' }))).status).toBe(401);
    signIn({ isAdmin: false });
    const res = await POST(jsonRequest('/api/admin/view-as', { plan: 'free' }));
    expect(res.status).toBe(403);
    expect(setCookie(res)).toBe('');
  });

  it('sets the cookie to a known tier', async () => {
    const res = await POST(jsonRequest('/api/admin/view-as', { plan: 'directory' }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ viewingAs: 'directory' });
    const cookie = setCookie(res);
    expect(cookie).toMatch(/^ph-view-as=directory;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('clears the cookie on plan: null', async () => {
    const res = await POST(jsonRequest('/api/admin/view-as', { plan: null }));
    expect(await readJson(res)).toEqual({ viewingAs: null });
    expect(setCookie(res)).toMatch(/^ph-view-as=;.*Max-Age=0/i);
  });

  it('400 on an unknown tier, a missing key, or a body that is not JSON', async () => {
    expect((await POST(jsonRequest('/api/admin/view-as', { plan: 'enterprise' }))).status).toBe(400);
    expect((await POST(jsonRequest('/api/admin/view-as', {}))).status).toBe(400);
    expect((await POST(rawRequest('/api/admin/view-as', 'nope'))).status).toBe(400);
  });
});
