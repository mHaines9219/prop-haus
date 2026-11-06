import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());

import { signIn, signOut } from '@/test/mocks/session';
import { POST } from './route';

// The sandbox switch: admins only; writes or clears an httpOnly cookie.

const setCookie = (res: Response) => res.headers.get('set-cookie') ?? '';

describe('POST /api/admin/sandbox', () => {
  beforeEach(() => signIn({ isAdmin: true, email: 'mhaines9219@gmail.com' }));

  it('401 signed out, 403 for a member', async () => {
    signOut();
    expect((await POST(jsonRequest('/api/admin/sandbox', { on: true }))).status).toBe(401);
    signIn({ isAdmin: false });
    const res = await POST(jsonRequest('/api/admin/sandbox', { on: true }));
    expect(res.status).toBe(403);
    expect(setCookie(res)).toBe('');
  });

  it('turns the sandbox on with an httpOnly cookie', async () => {
    const res = await POST(jsonRequest('/api/admin/sandbox', { on: true }));
    expect(await readJson(res)).toEqual({ sandbox: true });
    expect(setCookie(res)).toMatch(/^ph-sandbox=1;/);
    expect(setCookie(res)).toMatch(/HttpOnly/i);
  });

  it('turns it off by clearing the cookie', async () => {
    const res = await POST(jsonRequest('/api/admin/sandbox', { on: false }));
    expect(await readJson(res)).toEqual({ sandbox: false });
    expect(setCookie(res)).toMatch(/^ph-sandbox=;.*Max-Age=0/i);
  });

  it('400 unless `on` is a boolean', async () => {
    expect((await POST(jsonRequest('/api/admin/sandbox', { on: 'yes' }))).status).toBe(400);
    expect((await POST(jsonRequest('/api/admin/sandbox', {}))).status).toBe(400);
    expect((await POST(rawRequest('/api/admin/sandbox', 'nope'))).status).toBe(400);
  });
});
