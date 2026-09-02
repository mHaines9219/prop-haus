import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());

import { auth } from '@/test/mocks/supabase-server';
import * as route from './route';

/** Sign-out is a POST that clears the session and sends the browser to login with a GET. */

beforeEach(() => {
  auth.reset();
  auth.user = { id: 'u-1' };
});

it('signs out and 303s to /login on the request origin', async () => {
  const res = await route.POST(new Request('https://prophaus.example/auth/signout', { method: 'POST' }));
  expect(auth.signOutCalls).toBe(1);
  expect(auth.user).toBeNull();
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe('https://prophaus.example/login');
});

it('ignores a next parameter: sign-out always lands on login', async () => {
  const res = await route.POST(new Request('http://localhost:3000/auth/signout?next=https://evil.com', { method: 'POST' }));
  expect(res.headers.get('location')).toBe('http://localhost:3000/login');
});

it('exports no GET, so a prefetch or image tag cannot sign anyone out', () => {
  expect('GET' in route).toBe(false);
});
