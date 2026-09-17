// Public roster-application endpoint: validates the multipart form and emails
// the crew inbox through the mail provider. Nothing is stored.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREW_JOIN_EMAIL, ROSTER_MAX_FILE_BYTES } from '@/lib/crew';
import type { MailMessage } from '@/lib/mail/provider';

const send = vi.fn(async (_m: MailMessage) => ({ providerMessageId: 'test-1' }));
vi.mock('@/lib/mail/provider', () => ({ mailer: () => ({ send }) }));

import { POST } from './route';

function image(name: string, bytes = 100, type = 'image/jpeg') {
  return new File([new Uint8Array(bytes)], name, { type });
}

function request(fields: Record<string, string | File | File[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.set(key, value);
  }
  return new Request('http://test/api/crew/roster-applications', { method: 'POST', body: fd });
}

const valid = () => ({
  name: 'Dana Reyes',
  email: 'dana@example.com',
  website: 'danareyes.com',
  social: '@danaonset',
  headshot: image('dana.jpg'),
  photos: [image('set-1.jpg'), image('set-2.jpg')],
});

describe('POST /api/crew/roster-applications', () => {
  beforeEach(() => {
    send.mockClear();
  });

  it('emails the crew inbox with the headshot and work photos attached', async () => {
    const res = await POST(request(valid()));
    expect(res.status).toBe(201);

    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe(CREW_JOIN_EMAIL);
    expect(msg.replyTo).toBe('dana@example.com');
    expect(msg.subject).toBe('Roster application — Dana Reyes');
    expect(msg.text).toContain('Dana Reyes');
    expect(msg.text).toContain('Website: danareyes.com');
    expect(msg.text).toContain('Social media: @danaonset');
    expect(msg.html).toContain('danareyes.com');
    expect(msg.attachments?.map((a) => a.filename)).toEqual([
      'headshot-dana.jpg',
      'work-1-set-1.jpg',
      'work-2-set-2.jpg',
    ]);
    expect(msg.attachments?.every((a) => Buffer.isBuffer(a.content))).toBe(true);
  });

  it.each([
    ['missing name', { ...valid(), name: '  ' }, /name/i],
    ['bad email', { ...valid(), email: 'not-an-email' }, /email/i],
    ['missing website', { ...valid(), website: '  ' }, /website/i],
    ['missing social media', { ...valid(), social: '' }, /social/i],
    ['missing headshot', { ...valid(), headshot: '' }, /headshot/i],
    ['zero work photos', { ...valid(), photos: [] }, /at least one work photo/i],
    ['six work photos', { ...valid(), photos: Array.from({ length: 6 }, (_, i) => image(`w${i}.jpg`)) }, /5 work photos/],
    ['a non-image file', { ...valid(), photos: [new File(['x'], 'cv.pdf', { type: 'application/pdf' })] }, /not an image/],
    ['an oversized image', { ...valid(), headshot: image('big.jpg', ROSTER_MAX_FILE_BYTES + 1) }, /over 5 MB/],
  ])('rejects %s', async (_label, fields, message) => {
    const res = await POST(request(fields as Parameters<typeof request>[0]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a non-form body', async () => {
    const res = await POST(
      new Request('http://test/x', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }),
    );
    expect(res.status).toBe(400);
  });

  it('fakes success without sending when the honeypot is filled', async () => {
    const res = await POST(request({ ...valid(), company: 'Spam Inc' }));
    expect(res.status).toBe(201);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 502 when the mailer fails', async () => {
    send.mockRejectedValueOnce(new Error('provider down'));
    const res = await POST(request(valid()));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Failed to send application');
  });
});
