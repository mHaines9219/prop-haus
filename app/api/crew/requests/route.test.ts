import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/server', async () => (await import('@/test/mocks/supabase-server')).serverModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, USER_ID, signIn, signOut } from '@/test/mocks/session';
import { userDb } from '@/test/mocks/supabase-server';
import { db } from '@/test/mocks/supabase-admin';
import { GET, POST } from './route';

/**
 * Request-to-hire. Rows go through the user client (RLS in production), the
 * event through the admin client; the org is always the session's.
 */

const VALID = { contractor_id: 'c-1', requested_dates: ['2026-09-10'], location: ' Stage 4 ', notes: ' bring gloves ' };

beforeEach(() => {
  db.reset();
  userDb.reset();
  signIn();
  userDb.relation('contractors', 'crew_requests', 'contractor_id');
  userDb.seed('contractors', [{ id: 'c-1', name: 'Mara', photo: 'https://img/mara.jpg', bio: 'private' }]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(userDb.log).toEqual([]);
  });

  it('lists only the session org’s requests, newest first, with the contractor embed', async () => {
    userDb.seed('crew_requests', [
      { id: 'r-old', org_id: ORG_ID, contractor_id: 'c-1', requested_dates: [], location: null, notes: null, status: 'requested', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
      { id: 'r-new', org_id: ORG_ID, contractor_id: 'c-1', requested_dates: ['2026-09-10'], location: 'Stage 4', notes: null, status: 'requested', created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' },
      { id: 'r-theirs', org_id: OTHER_ORG_ID, contractor_id: 'c-1', requested_dates: [], location: null, notes: null, status: 'requested', created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z' },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const { requests } = await readJson<{ requests: Array<Record<string, unknown>> }>(res);
    expect(requests.map((r) => r.id)).toEqual(['r-new', 'r-old']);
    expect(requests[0]).toEqual({
      id: 'r-new',
      contractor_id: 'c-1',
      requested_dates: ['2026-09-10'],
      location: 'Stage 4',
      notes: null,
      status: 'requested',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
      contractors: { name: 'Mara', photo: 'https://img/mara.jpg' },
    });
  });

  it('answers an empty list rather than null', async () => {
    expect(await readJson(await GET())).toEqual({ requests: [] });
  });

  it('500 when the query fails', async () => {
    userDb.failNext('crew_requests', 'select', 'connection reset');
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'Failed to load requests' });
  });
});

describe('POST refusals', () => {
  it('401 when signed out, before reading the body', async () => {
    signOut();
    const res = await POST(jsonRequest('/api/crew/requests', VALID));
    expect(res.status).toBe(401);
    expect(userDb.log).toEqual([]);
    expect(db.log).toEqual([]);
  });

  it('400 for malformed JSON', async () => {
    const res = await POST(rawRequest('/api/crew/requests', '{nope'));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'invalid JSON' });
  });

  it.each([[{}], [{ contractor_id: '' }], [{ contractor_id: '   ' }]])('400 without a contractor: %j', async (body) => {
    const res = await POST(jsonRequest('/api/crew/requests', body));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toEqual({ error: 'contractor_id is required' });
    expect(userDb.rows('crew_requests')).toEqual([]);
  });

  // Observed: `contractor_id?.trim()` throws TypeError on a number, so the
  // handler rejects instead of answering 400.
  it.fails('400 when contractor_id is not a string', async () => {
    const res = await POST(jsonRequest('/api/crew/requests', { contractor_id: 42 }));
    expect(res.status).toBe(400);
  });

  // Observed: a string requested_dates is written as-is (201); Postgres would
  // reject the text[] column, the fake does not.
  it.fails('400 when requested_dates is not an array', async () => {
    const res = await POST(jsonRequest('/api/crew/requests', { contractor_id: 'c-1', requested_dates: '2026-09-10' }));
    expect(res.status).toBe(400);
    expect(userDb.rows('crew_requests')).toEqual([]);
  });

  it('500 when the insert fails, recording no event', async () => {
    userDb.failNext('crew_requests', 'insert', 'connection reset');
    const res = await POST(jsonRequest('/api/crew/requests', VALID));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'Failed to create request' });
    expect(db.rows('events')).toEqual([]);
  });
});

describe('POST', () => {
  it('creates the request under the session org with trimmed fields and records crew_requested', async () => {
    const res = await POST(jsonRequest('/api/crew/requests', VALID));
    expect(res.status).toBe(201);
    const { id } = await readJson<{ id: string }>(res);

    expect(userDb.rows('crew_requests')).toEqual([
      expect.objectContaining({
        id,
        org_id: ORG_ID,
        contractor_id: 'c-1',
        requested_dates: ['2026-09-10'],
        location: 'Stage 4',
        notes: 'bring gloves',
      }),
    ]);
    expect(db.rows('events')).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        user_id: USER_ID,
        type: 'crew_requested',
        payload: { crewRequestId: id, contractorId: 'c-1' },
      }),
    ]);
  });

  it('defaults dates, location and notes when absent or blank', async () => {
    await POST(jsonRequest('/api/crew/requests', { contractor_id: 'c-1', location: '  ', notes: '' }));
    expect(userDb.rows('crew_requests')[0]).toMatchObject({ requested_dates: [], location: null, notes: null });
  });

  it('ignores an org id in the body', async () => {
    await POST(jsonRequest('/api/crew/requests', { ...VALID, org_id: OTHER_ORG_ID, status: 'confirmed' }));
    const [row] = userDb.rows('crew_requests');
    expect(row.org_id).toBe(ORG_ID);
    expect(row.status).toBeUndefined();
  });

  it('still answers 201 when analytics is down', async () => {
    db.failNext('events', 'insert', 'events table on fire');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(jsonRequest('/api/crew/requests', VALID));
    expect(res.status).toBe(201);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('crew_requested'));
  });
});
