import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSupabase } from '@/test/helpers/fake-supabase';
import { EVENT_TYPES, logEvent, type EventSink } from './events';

/**
 * logEvent is the one writer for the event stream. It must write exactly the
 * row shape the table expects and must not swallow a rejected insert.
 */

let db: FakeSupabase;
beforeEach(() => {
  db = new FakeSupabase();
});

describe('logEvent', () => {
  it('writes the row with nulls and an empty payload by default', async () => {
    await logEvent(db.client(), { type: 'signup' });
    expect(db.rows('events')).toEqual([
      expect.objectContaining({ org_id: null, user_id: null, type: 'signup', payload: {} }),
    ]);
  });

  it('writes org, user and payload when given', async () => {
    await logEvent(db.client(), { orgId: 'org-1', userId: 'u-1', type: 'search', payload: { query: 'lamp' } });
    expect(db.rows('events')[0]).toMatchObject({ org_id: 'org-1', user_id: 'u-1', type: 'search', payload: { query: 'lamp' } });
  });

  it('keeps an explicit null org and user', async () => {
    await logEvent(db.client(), { orgId: null, userId: null, type: 'cart_abandoned' });
    expect(db.rows('events')[0]).toMatchObject({ org_id: null, user_id: null });
  });

  it('throws with the event type and the database message on a rejected insert', async () => {
    db.failNext('events', 'insert', { code: '42501', message: 'permission denied' });
    await expect(logEvent(db.client(), { type: 'search' })).rejects.toThrow(
      'events insert failed for "search": permission denied',
    );
    expect(db.rows('events')).toEqual([]);
  });

  it('stringifies a non-object error', async () => {
    const sink: EventSink = { from: () => ({ insert: async () => ({ error: 'nope' }) }) };
    await expect(logEvent(sink, { type: 'signup' })).rejects.toThrow('events insert failed for "signup": nope');
  });

  it('only ever writes to the events table', async () => {
    await logEvent(db.client(), { type: 'paywall_hit' });
    expect(db.log).toEqual([{ table: 'events', op: 'insert' }]);
  });
});

describe('EVENT_TYPES', () => {
  it('is a unique list of snake_case names', () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
    for (const t of EVENT_TYPES) expect(t).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });
});
