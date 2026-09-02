'use client';

import { useState } from 'react';
import { ApiError, postJson } from '@/lib/api';
import type { OutboundMessage } from '@/lib/outreach/send';
import { StatusToken, messageStatusSpec } from '@/components/ap/status-token';
import { OutreachDrawer, formatSentAt } from '@/components/ap/outreach-drawer';

/** The "Vendor requests" section on an order: what went out, to whom, and whether it landed. */
export function VendorRequests({ initial }: { initial: OutboundMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (messages.length === 0) return null;

  const open = messages.find((m) => m.id === openId) ?? null;

  async function retry(id: string) {
    setRetrying(id);
    setRetryError(null);
    try {
      const { message } = await postJson<{ message: OutboundMessage }>(`/api/outreach/${id}/retry`, {});
      setMessages((ms) => ms.map((m) => (m.id === id ? message : m)));
    } catch (err) {
      setRetryError(err instanceof ApiError ? err.message : 'Retry did not go through.');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="font-heading text-[15px] font-bold tracking-[-0.02em]">Vendor requests</h2>
        <p className="font-mono text-[12px] tabular-nums text-text-tertiary">{headline(messages)}</p>
      </div>
      <div className="divide-y divide-border">
        {messages.map((m) => (
          <div key={m.id} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{m.vendorName}</p>
              <p className="mt-0.5 truncate font-mono text-[12px] text-text-tertiary">
                {m.to || 'No address on file'}
                {m.edited ? ' · edited' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {m.sentAt && (
                <span className="hidden font-mono text-[12px] tabular-nums text-text-tertiary sm:inline">
                  {formatSentAt(m.sentAt)}
                </span>
              )}
              <StatusToken {...messageStatusSpec(m.status)} />
              {m.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => retry(m.id)}
                  disabled={retrying === m.id}
                  className="font-mono text-[12px] text-text-secondary underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {retrying === m.id ? 'Sending…' : 'Retry'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenId(m.id)}
                className="font-mono text-[12px] text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
              >
                View
              </button>
            </div>
          </div>
        ))}
      </div>
      {retryError && <p className="mt-2 font-mono text-[12px] text-accent-text">{retryError}</p>}

      <OutreachDrawer
        message={
          open
            ? {
                vendorName: open.vendorName,
                to: open.to,
                cc: open.cc,
                replyTo: open.replyTo,
                subject: open.subject,
                bodyText: open.bodyText,
                attachments: open.attachments,
                status: open.status,
                sentAt: open.sentAt,
                error: open.error,
              }
            : null
        }
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

/** "Sent to 3 vendors." / "Sent to 2 of 3 vendors. 1 failed." / "Sending to 3 vendors." */
export function headline(messages: { status: string }[]): string {
  const total = messages.length;
  const sent = messages.filter((m) => m.status === 'sent').length;
  const failed = messages.filter((m) => m.status === 'failed').length;
  const noun = `vendor${total !== 1 ? 's' : ''}`;
  if (sent === total) return `Sent to ${total} ${noun}.`;
  if (failed === 0) return `Sending to ${total} ${noun}.`;
  return `Sent to ${sent} of ${total} ${noun}. ${failed} failed.`;
}
