// Mail provider selection and the SendGrid implementation (Resend and the
// logger are exercised through lib/outreach; SendGrid is tested here).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogMailer, ResendMailer, SendGridMailer, mailer, type MailMessage } from './provider';

const message = (over: Partial<MailMessage> = {}): MailMessage => ({
  to: 'crew@prophaus.example',
  replyTo: 'dana@example.com',
  subject: 'Roster application — Dana',
  text: 'plain body',
  html: '<p>html body</p>',
  ...over,
});

const ok = (headers: Record<string, string> = {}) => new Response(null, { status: 202, headers });

describe('SendGridMailer', () => {
  it('posts the v3 payload with parsed from, reply_to, both bodies and attachments', async () => {
    const fetchMock = vi.fn(async () => ok({ 'x-message-id': 'sg-123' }));
    const mail = new SendGridMailer('sg-key', 'Prop Haus <crew@prophaus.example>', async () => {
      throw new Error('unused');
    }, fetchMock);

    const result = await mail.send(
      message({
        cc: ['ops@prophaus.example'],
        attachments: [{ filename: 'headshot.jpg', content: Buffer.from('img'), contentType: 'image/jpeg' }],
      }),
    );

    expect(result.providerMessageId).toBe('sg-123');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sg-key');
    const body = JSON.parse(init.body as string);
    expect(body.from).toEqual({ email: 'crew@prophaus.example', name: 'Prop Haus' });
    expect(body.personalizations).toEqual([
      { to: [{ email: 'crew@prophaus.example' }], cc: [{ email: 'ops@prophaus.example' }] },
    ]);
    expect(body.reply_to).toEqual({ email: 'dana@example.com' });
    expect(body.content).toEqual([
      { type: 'text/plain', value: 'plain body' },
      { type: 'text/html', value: '<p>html body</p>' },
    ]);
    expect(body.attachments).toEqual([
      { filename: 'headshot.jpg', content: Buffer.from('img').toString('base64'), type: 'image/jpeg', disposition: 'attachment' },
    ]);
  });

  it('accepts a bare from address, omits empty cc/attachments, and invents an id when the header is missing', async () => {
    const fetchMock = vi.fn(async () => ok());
    const mail = new SendGridMailer('k', 'crew@prophaus.example', async () => Buffer.alloc(0), fetchMock);

    const result = await mail.send(message());
    expect(result.providerMessageId).toMatch(/^sendgrid-/);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.from).toEqual({ email: 'crew@prophaus.example' });
    expect(body.personalizations[0].cc).toBeUndefined();
    expect(body.attachments).toBeUndefined();
  });

  it('resolves storage-path attachments through the resolver', async () => {
    const fetchMock = vi.fn(async () => ok());
    const resolve = vi.fn(async () => Buffer.from('pdf-bytes'));
    const mail = new SendGridMailer('k', 'crew@prophaus.example', resolve, fetchMock);

    await mail.send(
      message({
        attachments: [{ filename: 'form.pdf', content: { storagePath: 'org/form.pdf' }, contentType: 'application/pdf' }],
      }),
    );
    expect(resolve).toHaveBeenCalledWith('org/form.pdf');
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.attachments[0].content).toBe(Buffer.from('pdf-bytes').toString('base64'));
  });

  it('throws with the status and response detail on failure', async () => {
    const fetchMock = vi.fn(async () => new Response('{"errors":[{"message":"bad key"}]}', { status: 401 }));
    const mail = new SendGridMailer('k', 'crew@prophaus.example', async () => Buffer.alloc(0), fetchMock);
    await expect(mail.send(message())).rejects.toThrow(/sendgrid 401: .*bad key/);
  });
});

describe('mailer()', () => {
  const resolve = async () => Buffer.alloc(0);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('defaults to the logger', () => {
    vi.stubEnv('MAIL_PROVIDER', '');
    expect(mailer(resolve)).toBeInstanceOf(LogMailer);
  });

  it.each([
    ['resend', 'RESEND_API_KEY', ResendMailer],
    ['sendgrid', 'SENDGRID_API_KEY', SendGridMailer],
  ] as const)('picks %s when its key and MAIL_FROM are set', (provider, keyVar, cls) => {
    vi.stubEnv('MAIL_PROVIDER', provider);
    vi.stubEnv(keyVar, 'secret');
    vi.stubEnv('MAIL_FROM', 'Prop Haus <crew@prophaus.example>');
    expect(mailer(resolve)).toBeInstanceOf(cls);
  });

  it.each(['resend', 'sendgrid'] as const)('falls back to the logger when %s is unconfigured', (provider) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('MAIL_PROVIDER', provider);
    vi.stubEnv('MAIL_FROM', '');
    expect(mailer(resolve)).toBeInstanceOf(LogMailer);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(provider));
  });
});
