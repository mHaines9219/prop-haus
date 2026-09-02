import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequest } from '@/test/helpers/request';

vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());

import { auth } from '@/test/mocks/supabase-server';
import { GET } from './route';

/**
 * Where the magic link lands. Unauthenticated by necessity, so the two things
 * to prove are that the code is exchanged and that `next` cannot leave the site.
 */

const ORIGIN = 'http://localhost:3000';

beforeEach(() => {
  auth.reset();
});

it('bounces to login without a code, exchanging nothing', async () => {
  const res = await GET(getRequest('/auth/callback'));
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=missing_code`);
  expect(auth.exchangeCalls).toEqual([]);
});

it('exchanges the code and lands on /projects by default', async () => {
  const res = await GET(getRequest('/auth/callback?code=abc123'));
  expect(auth.exchangeCalls).toEqual(['abc123']);
  expect(res.status).toBe(307);
  expect(res.headers.get('location')).toBe(`${ORIGIN}/projects`);
});

it('bounces to login when the exchange fails', async () => {
  auth.exchangeResult = { error: { message: 'expired' } };
  const res = await GET(getRequest('/auth/callback?code=stale'));
  expect(auth.exchangeCalls).toEqual(['stale']);
  expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=exchange_failed`);
});

it('honours a same-site next', async () => {
  const res = await GET(getRequest('/auth/callback?code=abc&next=%2Fprojects%2F1%3Ftab%3Ditems'));
  expect(res.headers.get('location')).toBe(`${ORIGIN}/projects/1?tab=items`);
});

describe('open redirect', () => {
  it.each([
    ['//evil.com'],
    ['//evil.com/projects'],
    ['https://evil.com'],
    ['http://evil.com/'],
    ['javascript:alert(1)'],
    ['/\\evil.com'],
    ['\\evil.com'],
    ['\\\\evil.com'],
    ['evil.com'],
    [''],
  ])('next=%j stays on this origin', async (next) => {
    const res = await GET(getRequest(`/auth/callback?code=abc&next=${encodeURIComponent(next)}`));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/projects`);
  });

  it('a rejected next still bounces to login on a failed exchange, never off-site', async () => {
    auth.exchangeResult = { error: { message: 'expired' } };
    const res = await GET(getRequest('/auth/callback?code=abc&next=https%3A%2F%2Fevil.com'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?error=exchange_failed`);
  });
});

it('redirects relative to the request origin, not a hard-coded host', async () => {
  const res = await GET(new Request('https://prophaus.example/auth/callback?code=abc&next=%2Forders'));
  expect(res.headers.get('location')).toBe('https://prophaus.example/orders');
});
