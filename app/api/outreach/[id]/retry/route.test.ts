import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { params, rawRequest, readJson } from '@/test/helpers/request';

vi.mock('@/lib/session', async () => (await import('@/test/mocks/session')).sessionModule());
vi.mock('@/lib/supabase/admin', async () => (await import('@/test/mocks/supabase-admin')).adminModule());

import { ORG_ID, OTHER_ORG_ID, signIn, signOut } from '@/test/mocks/session';
import { db } from '@/test/mocks/supabase-admin';
import { LogMailer } from '@/lib/mail/provider';
import type { OutboundMessage } from '@/lib/outreach/send';
import { POST } from './route';

const req = () => rawRequest('/api/outreach/m-1/retry', '');

function seedMessage(over: Record<string, unknown> = {}) {
  return db.seed('outbound_messages', [
    {
      id: 'm-1',
      org_id: ORG_ID,
      order_id: 'order-1',
      vendor_id: 'omega',
      vendor_name: 'Omega Cinema Props',
      to_email: 'orders@omegacinemaprops.com',
      cc_emails: [],
      reply_to: 'sam@nocturne.example',
      subject: 'Hold request',
      body_text: 'Hello',
      body_html: '<p>Hello</p>',
      attachments: [],
      status: 'failed',
      error: 'provider down',
      edited: false,
      created_at: '2026-09-02T10:00:00.000Z',
      ...over,
    },
  ])[0];
}

let send: MockInstance<LogMailer['send']>;

beforeEach(() => {
  db.reset();
  signIn();
  vi.stubEnv('MAIL_PROVIDER', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  send = vi.spyOn(LogMailer.prototype, 'send');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/outreach/[id]/retry', () => {
  it('401 when signed out, before reading anything', async () => {
    signOut();
    seedMessage();
    const res = await POST(req(), params({ id: 'm-1' }));
    expect(res.status).toBe(401);
    expect(await readJson(res)).toEqual({ error: 'not signed in' });
    expect(db.log).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('re-sends the failed message once and returns it as sent', async () => {
    seedMessage();
    const res = await POST(req(), params({ id: 'm-1' }));
    expect(res.status).toBe(200);
    const { message } = await readJson<{ message: OutboundMessage }>(res);
    expect(message).toMatchObject({ id: 'm-1', status: 'sent', to: 'orders@omegacinemaprops.com' });
    expect(message).not.toHaveProperty('error');
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.rows('outbound_messages')[0]).toMatchObject({ status: 'sent', error: null });
  });

  it("404 for another org's message, which stays failed and unsent", async () => {
    seedMessage({ org_id: OTHER_ORG_ID });
    const res = await POST(req(), params({ id: 'm-1' }));
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: 'not found' });
    expect(send).not.toHaveBeenCalled();
    expect(db.rows('outbound_messages')[0].status).toBe('failed');
  });

  it('404 for an id that does not exist', async () => {
    const res = await POST(req(), params({ id: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('409 for a message that did not fail, and sends nothing', async () => {
    seedMessage({ status: 'sent', error: null });
    const res = await POST(req(), params({ id: 'm-1' }));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'only failed messages can be retried' });
    expect(send).not.toHaveBeenCalled();
  });
});
