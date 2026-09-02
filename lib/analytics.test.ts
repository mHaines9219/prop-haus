import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * recordEvents is the only analytics entry point route handlers use, and the
 * contract is that it never rejects: a missing key, a dead database or a
 * rejected insert becomes one console.warn naming the event types.
 */

vi.mock('@/lib/supabase/admin', async () => {
  const { db } = await import('@/test/mocks/supabase-admin');
  return { createAdminClient: vi.fn(() => db.client()) };
});

import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/test/mocks/supabase-admin';
import { recordEvents } from './analytics';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.reset();
  vi.mocked(createAdminClient).mockClear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordEvents', () => {
  it('writes every event it is given', async () => {
    await recordEvents({ orgId: 'o1', type: 'search', payload: { q: 'lamp' } }, { type: 'cart_add' });
    expect(db.rows('events')).toEqual([
      expect.objectContaining({ org_id: 'o1', type: 'search', payload: { q: 'lamp' } }),
      expect.objectContaining({ org_id: null, type: 'cart_add', payload: {} }),
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing, not even open a client, with no events', async () => {
    await recordEvents();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(db.log).toEqual([]);
  });

  it('swallows a rejected insert and warns with the event types', async () => {
    db.failNext('events', 'insert', 'events table on fire');
    await expect(recordEvents({ type: 'search' }, { type: 'zero_result_search' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[events] not recorded (search, zero_result_search): events insert failed for "search": events table on fire',
    );
  });

  it('swallows a client that cannot be created (no service-role key)', async () => {
    vi.mocked(createAdminClient).mockImplementationOnce(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    });
    await expect(recordEvents({ type: 'signup' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[events] not recorded (signup): SUPABASE_SERVICE_ROLE_KEY is not set');
    expect(db.rows('events')).toEqual([]);
  });

  it('still records the events that succeed when one in the batch fails', async () => {
    db.failNext('events', 'insert', 'boom');
    await recordEvents({ type: 'search' }, { type: 'cart_add' });
    expect(db.rows('events').map((r) => r.type)).toEqual(['cart_add']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
