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

describe('LogMailer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the envelope and a body preview, and returns a log id without touching the network', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LogMailer().send(
      message({
        cc: ['ap@example.com', 'ops@example.com'],
        text: 'y'.repeat(600),
        attachments: [{ filename: 'coi.pdf', content: { storagePath: 'org/coi.pdf' }, contentType: 'application/pdf' }],
      }),
    );

    vi.unstubAllGlobals();
    expect(result.providerMessageId).toMatch(/^log-[0-9a-f-]{36}$/);
    expect(fetchMock).not.toHaveBeenCalled();
    const line = log.mock.calls[0][0] as string;
    expect(line).toContain('to=crew@prophaus.example cc=ap@example.com,ops@example.com replyTo=dana@example.com');
    expect(line).toContain('attachments=coi.pdf');
    expect(line.endsWith('\n' + 'y'.repeat(500))).toBe(true);
  });

  it('logs no cc and "none" when the message has neither', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new LogMailer().send(message());
    const line = log.mock.calls[0][0] as string;
    expect(line).not.toContain('cc=');
    expect(line).toContain('attachments=none');
  });
});

describe('ResendMailer', () => {
  it('posts to Resend with the key, the from, reply_to, both bodies and base64 attachments', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'rs-123' }));
    const resolve = vi.fn(async () => Buffer.from('pdf-bytes'));
    const mail = new ResendMailer('re_test_key', 'Prop Haus <orders@prophaus.example>', resolve, fetchMock);

    const result = await mail.send(
      message({
        cc: ['ap@example.com'],
        attachments: [
          { filename: 'inline.txt', content: Buffer.from('raw'), contentType: 'text/plain' },
          { filename: 'form.pdf', content: { storagePath: 'org/form.pdf' }, contentType: 'application/pdf' },
        ],
      }),
    );

    expect(result.providerMessageId).toBe('rs-123');
    expect(resolve).toHaveBeenCalledWith('org/form.pdf');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Prop Haus <orders@prophaus.example>',
      to: ['crew@prophaus.example'],
      cc: ['ap@example.com'],
      reply_to: 'dana@example.com',
      subject: 'Roster application — Dana',
      text: 'plain body',
      html: '<p>html body</p>',
      attachments: [
        { filename: 'inline.txt', content: Buffer.from('raw').toString('base64'), content_type: 'text/plain' },
        { filename: 'form.pdf', content: Buffer.from('pdf-bytes').toString('base64'), content_type: 'application/pdf' },
      ],
    });
  });

  it('omits cc and attachments when there are none', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'rs-1' }));
    await new ResendMailer('k', 'orders@prophaus.example', async () => Buffer.alloc(0), fetchMock).send(message());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('cc');
    expect(body).not.toHaveProperty('attachments');
  });

  it('throws with the status and response detail on failure', async () => {
    const fetchMock = vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 }));
    const mail = new ResendMailer('k', 'orders@prophaus.example', async () => Buffer.alloc(0), fetchMock);
    await expect(mail.send(message())).rejects.toThrow(/resend 403: .*domain not verified/);
  });

  it('throws when Resend answers without a message id', async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    const mail = new ResendMailer('k', 'orders@prophaus.example', async () => Buffer.alloc(0), fetchMock);
    await expect(mail.send(message())).rejects.toThrow('resend returned no message id');
  });

  it('throws when an attachment cannot be resolved, before calling Resend', async () => {
    const fetchMock = vi.fn();
    const mail = new ResendMailer('k', 'orders@prophaus.example', async () => {
      throw new Error('attachment org/x.pdf: not found');
    }, fetchMock);
    await expect(
      mail.send(message({ attachments: [{ filename: 'x.pdf', content: { storagePath: 'org/x.pdf' }, contentType: 'application/pdf' }] })),
    ).rejects.toThrow('attachment org/x.pdf: not found');
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('ignores a provider key when MAIL_PROVIDER does not name that provider', () => {
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('RESEND_API_KEY', 'secret');
    vi.stubEnv('MAIL_FROM', 'Prop Haus <crew@prophaus.example>');
    expect(mailer(resolve)).toBeInstanceOf(LogMailer);
  });

  it('falls back to the logger when resend has MAIL_FROM but no key', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('MAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('MAIL_FROM', 'Prop Haus <crew@prophaus.example>');
    expect(mailer(resolve)).toBeInstanceOf(LogMailer);
  });

  it.each(['resend', 'sendgrid'] as const)('falls back to the logger when %s is unconfigured', (provider) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('MAIL_PROVIDER', provider);
    vi.stubEnv('MAIL_FROM', '');
    expect(mailer(resolve)).toBeInstanceOf(LogMailer);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(provider));
  });
});
