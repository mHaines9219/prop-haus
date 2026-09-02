import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, rawRequest } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { POST } from './route';

/**
 * The beacon, exercised (route.test.ts reads source). It is always 204: the
 * caller is already navigating away, so the only observable is the events row.
 */

const VALID = { itemId: 'omega-12345', source: 'omega', surface: 'item_detail' };

beforeEach(() => {
  db.reset();
  signIn();
});

describe('dropped beacons', () => {
  it('204 with no row and no session read for a malformed body', async () => {
    const res = await POST(rawRequest('/api/events/outbound-click', 'not json'));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(db.rows('events')).toEqual([]);
    expect(db.log).toEqual([]);
  });

  it.each([
    ['null body', null],
    ['array body', []],
    ['missing itemId', { source: 'omega', surface: 'item_detail' }],
    ['empty itemId', { ...VALID, itemId: '' }],
    ['numeric itemId', { ...VALID, itemId: 12345 }],
    ['itemId over 256', { ...VALID, itemId: 'x'.repeat(257) }],
    ['unknown source', { ...VALID, source: 'amazon' }],
    ['numeric source', { ...VALID, source: 1 }],
    ['unknown surface', { ...VALID, surface: 'search_grid' }],
    ['missing surface', { itemId: 'omega-1', source: 'omega' }],
  ])('204 and no row for %s', async (_label, body) => {
    const res = await POST(jsonRequest('/api/events/outbound-click', body));
    expect(res.status).toBe(204);
    expect(db.rows('events')).toEqual([]);
  });

  // Observed: isSource uses `v in SOURCE_META`, so 'toString' passes and a row
  // with source 'toString' is written to the demand stream.
  it.fails('drops a prototype key posing as a source', async () => {
    await POST(jsonRequest('/api/events/outbound-click', { ...VALID, source: 'toString' }));
    expect(db.rows('events')).toEqual([]);
  });
});

describe('recorded beacons', () => {
  it('records outbound_click against the session org with only the allow-listed fields', async () => {
    const res = await POST(jsonRequest('/api/events/outbound-click', { ...VALID, extra: 'dropped', orgId: 'forged' }));
    expect(res.status).toBe(204);
    expect(db.rows('events')).toEqual([
      expect.objectContaining({ org_id: ORG_ID, user_id: null, type: 'outbound_click', payload: VALID }),
    ]);
  });

  it('records a null-org event for a signed-out visitor', async () => {
    signOut();
    await POST(jsonRequest('/api/events/outbound-click', VALID));
    expect(db.rows('events')).toEqual([expect.objectContaining({ org_id: null, type: 'outbound_click', payload: VALID })]);
  });

  it('accepts an itemId of exactly 256 characters', async () => {
    await POST(jsonRequest('/api/events/outbound-click', { ...VALID, itemId: 'x'.repeat(256) }));
    expect(db.rows('events')).toHaveLength(1);
  });

  it('parses a sendBeacon body with no content-type', async () => {
    await POST(rawRequest('/api/events/outbound-click', JSON.stringify(VALID)));
    expect(db.rows('events')).toHaveLength(1);
  });

  it('still answers 204 when analytics is down', async () => {
    db.failNext('events', 'insert', 'events table on fire');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(jsonRequest('/api/events/outbound-click', VALID));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('outbound_click'));
  });
});
