import { beforeEach, expect, it, vi } from 'vitest';
import { getRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());

import { auth, userDb } from '@/test/mocks/supabase-server';
import { GET } from './route';

/**
 * The public crew directory: no session, only active crew, and the role
 * filter maps to the skill groups in lib/crew.ts.
 */

const COLUMNS = ['id', 'name', 'photo', 'skills', 'city', 'rate_low', 'rate_high', 'bio', 'category'];

function contractor(over: Record<string, unknown>) {
  return {
    name: 'Zed',
    photo: null,
    skills: ['general'],
    city: 'Los Angeles',
    rate_low: 300,
    rate_high: 450,
    bio: '',
    category: 'crew',
    active: true,
    secret_rate_notes: 'never sent',
    ...over,
  };
}

beforeEach(() => {
  userDb.reset();
  auth.reset();
  userDb.seed('contractors', [
    contractor({ id: 'pa', name: 'Mara', skills: ['set-hands', 'load-in'] }),
    contractor({ id: 'driver', name: 'Alex', skills: ['delivery'] }),
    contractor({ id: 'both', name: 'Jo', skills: ['delivery', 'set-dressing'] }),
    contractor({ id: 'inactive', name: 'Old', active: false }),
    contractor({ id: 'caterer', name: 'Chef', category: 'catering', skills: ['delivery'] }),
  ]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

it('lists active crew sorted by name with only the public columns', async () => {
  const res = await GET(getRequest('/api/crew'));
  expect(res.status).toBe(200);
  const { contractors } = await readJson<{ contractors: Array<Record<string, unknown>> }>(res);
  expect(contractors.map((c) => c.name)).toEqual(['Alex', 'Jo', 'Mara']);
  for (const c of contractors) expect(Object.keys(c).sort()).toEqual([...COLUMNS].sort());
});

it('needs no session', async () => {
  auth.user = null;
  const res = await GET(getRequest('/api/crew'));
  expect(res.status).toBe(200);
});

it('400 for an unknown role, before querying', async () => {
  const res = await GET(getRequest('/api/crew?role=gaffer'));
  expect(res.status).toBe(400);
  expect(await readJson(res)).toEqual({ error: 'unknown role' });
  expect(userDb.log).toEqual([]);
});

it('empty role is unknown too', async () => {
  expect((await GET(getRequest('/api/crew?role='))).status).toBe(400);
});

it('filters production assistants by their skill group', async () => {
  const { contractors } = await readJson<{ contractors: Array<{ id: string }> }>(
    await GET(getRequest('/api/crew?role=production-assistant')),
  );
  expect(contractors.map((c) => c.id)).toEqual(['both', 'pa']);
});

it('filters delivery by its skill group', async () => {
  const { contractors } = await readJson<{ contractors: Array<{ id: string }> }>(await GET(getRequest('/api/crew?role=delivery')));
  expect(contractors.map((c) => c.id)).toEqual(['driver', 'both']);
});

it('answers an empty list rather than null', async () => {
  userDb.reset();
  expect(await readJson(await GET(getRequest('/api/crew')))).toEqual({ contractors: [] });
});

it('500 when the query fails', async () => {
  userDb.failNext('contractors', 'select', 'connection reset');
  const res = await GET(getRequest('/api/crew'));
  expect(res.status).toBe(500);
  expect(await readJson(res)).toEqual({ error: 'Failed to load contractors' });
  expect(console.error).toHaveBeenCalled();
});

it('sets no CDN cache header (force-dynamic)', async () => {
  const res = await GET(getRequest('/api/crew'));
  expect(res.headers.get('cache-control')).toBeNull();
});
