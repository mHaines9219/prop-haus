/**
 * Outbound mail behind one interface. The default is a logger, so every flow
 * that sends demos with zero secrets; Resend and SendGrid are the real
 * providers, reached with plain fetch so there is no SDK to carry.
 *
 *   MAIL_PROVIDER=log|resend|sendgrid   picks the implementation (default: log)
 *   RESEND_API_KEY                      Resend secret
 *   SENDGRID_API_KEY                    SendGrid secret
 *   MAIL_FROM                           the From header, e.g. "Prop Haus <orders@prophaus.example>"
 */

export type MailAttachment = {
  filename: string;
  /** Raw bytes, or a path in the private paperwork bucket the mailer resolves. */
  content: Buffer | { storagePath: string };
  contentType: string;
};

export type MailMessage = {
  to: string;
  cc?: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

export type Mailer = {
  send(message: MailMessage): Promise<{ providerMessageId: string }>;
};

/** Logs the envelope and the first 500 characters. Never fails. */
export class LogMailer implements Mailer {
  async send(message: MailMessage): Promise<{ providerMessageId: string }> {
    const id = `log-${crypto.randomUUID()}`;
    const attachments = (message.attachments ?? []).map((a) => a.filename).join(', ') || 'none';
    console.log(
      `[mail:log] to=${message.to}` +
        (message.cc?.length ? ` cc=${message.cc.join(',')}` : '') +
        ` replyTo=${message.replyTo} subject="${message.subject}" attachments=${attachments} id=${id}\n` +
        message.text.slice(0, 500),
    );
    return { providerMessageId: id };
  }
}

type ResolveAttachment = (storagePath: string) => Promise<Buffer>;

/** Resend's REST API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly resolve: ResolveAttachment,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<{ providerMessageId: string }> {
    const attachments = await Promise.all(
      (message.attachments ?? []).map(async (a) => ({
        filename: a.filename,
        content: (Buffer.isBuffer(a.content) ? a.content : await this.resolve(a.content.storagePath)).toString(
          'base64',
        ),
        content_type: a.contentType,
      })),
    );

    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        ...(message.cc?.length ? { cc: message.cc } : {}),
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`resend ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error('resend returned no message id');
    return { providerMessageId: data.id };
  }
}

/** SendGrid's v3 mail send API (https://www.twilio.com/docs/sendgrid/api-reference/mail-send). */
export class SendGridMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly resolve: ResolveAttachment,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<{ providerMessageId: string }> {
    const attachments = await Promise.all(
      (message.attachments ?? []).map(async (a) => ({
        filename: a.filename,
        content: (Buffer.isBuffer(a.content) ? a.content : await this.resolve(a.content.storagePath)).toString(
          'base64',
        ),
        type: a.contentType,
        disposition: 'attachment',
      })),
    );

    const res = await this.fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: message.to }],
            ...(message.cc?.length ? { cc: message.cc.map((email) => ({ email })) } : {}),
          },
        ],
        from: parseAddress(this.from),
        reply_to: { email: message.replyTo },
        subject: message.subject,
        content: [
          { type: 'text/plain', value: message.text },
          { type: 'text/html', value: message.html },
        ],
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`sendgrid ${res.status}: ${detail.slice(0, 300)}`);
    }
    // SendGrid answers 202 with an empty body; the id lives in the x-message-id header.
    return { providerMessageId: res.headers.get('x-message-id') ?? `sendgrid-${crypto.randomUUID()}` };
  }
}

/** "Prop Haus <orders@x.com>" → { name, email }; a bare address passes through. */
function parseAddress(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { email: m[2], ...(m[1] ? { name: m[1] } : {}) } : { email: from };
}

/** The configured mailer. Falls back to the logger when a real provider is chosen but not configured. */
export function mailer(resolve: ResolveAttachment): Mailer {
  const provider = process.env.MAIL_PROVIDER;
  const from = process.env.MAIL_FROM;
  if (provider === 'resend') {
    const key = process.env.RESEND_API_KEY;
    if (key && from) return new ResendMailer(key, from, resolve);
    console.warn('[mail] MAIL_PROVIDER=resend but RESEND_API_KEY or MAIL_FROM is unset; logging instead');
  }
  if (provider === 'sendgrid') {
    const key = process.env.SENDGRID_API_KEY;
    if (key && from) return new SendGridMailer(key, from, resolve);
    console.warn('[mail] MAIL_PROVIDER=sendgrid but SENDGRID_API_KEY or MAIL_FROM is unset; logging instead');
  }
  return new LogMailer();
}
