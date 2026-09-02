'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useAutoResizeTextarea } from '@/hooks/use-auto-resize-textarea';
import { StatusToken, messageStatusSpec } from '@/components/ap/status-token';

/**
 * The vendor email, in a §9.6 right drawer: 440px, surface-raised, radius 0,
 * hairline left seam, one overlay shadow, `rail` entrance. On the cart it is
 * editable and the edit rides along with the click; on the order page it shows
 * what went out, read-only.
 */

export type DrawerMessage = {
  vendorName: string;
  to: string;
  cc: string[];
  replyTo: string;
  subject: string;
  bodyText: string;
  attachments: { name: string }[];
  warnings?: string[];
  status?: string;
  sentAt?: string;
  error?: string;
};

type Editing = {
  edited: boolean;
  onChange: (patch: { subject?: string; bodyText?: string }) => void;
  onReset: () => void;
};

export function OutreachDrawer({
  message,
  onClose,
  editing,
}: {
  message: DrawerMessage | null;
  onClose: () => void;
  editing?: Editing;
}) {
  const reduce = useReducedMotion();
  const open = message !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const rail = reduce
    ? { duration: 0.12 }
    : { type: 'spring' as const, stiffness: 320, damping: 34, mass: 1 };

  return (
    <AnimatePresence>
      {message && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-background/70"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal
            aria-label={`Email to ${message.vendorName}`}
            initial={reduce ? { opacity: 0 } : { x: 440 }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: 440 }}
            transition={rail}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface-raised shadow-[var(--shadow-overlay)] sm:w-[440px]"
          >
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  {editing ? 'Email draft' : 'Email sent'}
                </p>
                <h2 className="mt-1 truncate font-heading text-[18px] font-bold tracking-[-0.02em]">
                  {message.vendorName}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center text-text-tertiary transition-colors hover:text-foreground"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <Row delay={0} reduce={reduce}>
                <Envelope message={message} />
              </Row>

              <Row delay={1} reduce={reduce}>
                <label className="mt-5 block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  Subject
                </label>
                {editing ? (
                  <input
                    value={message.subject}
                    onChange={(e) => editing.onChange({ subject: e.target.value })}
                    className="mt-1.5 w-full border border-border bg-surface-inset px-3 py-2 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                ) : (
                  <p className="mt-1.5 font-mono text-[13px] text-foreground">{message.subject}</p>
                )}
              </Row>

              <Row delay={2} reduce={reduce}>
                <div className="mt-5 flex items-baseline justify-between">
                  <label className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Message
                  </label>
                  {editing?.edited && (
                    <button
                      type="button"
                      onClick={editing.onReset}
                      className="font-mono text-[12px] text-text-tertiary underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Reset to draft
                    </button>
                  )}
                </div>
                {editing ? (
                  <BodyEditor value={message.bodyText} onChange={(bodyText) => editing.onChange({ bodyText })} />
                ) : (
                  <pre className="mt-1.5 whitespace-pre-wrap border border-border bg-surface-inset px-3 py-3 font-sans text-[14px] leading-relaxed text-foreground">
                    {message.bodyText}
                  </pre>
                )}
              </Row>

              <Row delay={3} reduce={reduce}>
                <p className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  Attachments
                </p>
                {message.attachments.length === 0 ? (
                  <p className="mt-1.5 font-mono text-[13px] text-text-secondary">None</p>
                ) : (
                  <ul className="mt-1.5 space-y-1 font-mono text-[13px] text-foreground">
                    {message.attachments.map((a) => (
                      <li key={a.name}>{a.name}</li>
                    ))}
                  </ul>
                )}
              </Row>

              {message.warnings && message.warnings.length > 0 && (
                <Row delay={4} reduce={reduce}>
                  <ul className="mt-5 space-y-1 font-mono text-[12px] text-accent-text">
                    {message.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <p className="mt-2 font-mono text-[12px] text-text-tertiary">
                    Shown to you only. Not part of the email.
                  </p>
                </Row>
              )}
            </div>

            {editing && (
              <div className="border-t border-border px-5 py-4">
                <p className="font-mono text-[12px] text-text-tertiary">
                  {editing.edited ? 'Your edit goes out with the click.' : 'Sent as written with the click.'}
                </p>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Envelope({ message }: { message: DrawerMessage }) {
  return (
    <dl className="space-y-1.5 font-mono text-[13px]">
      <div className="flex gap-3">
        <dt className="w-14 shrink-0 text-text-tertiary">To</dt>
        <dd className="min-w-0 break-all text-foreground">{message.to || 'No address on file'}</dd>
      </div>
      {message.cc.length > 0 && (
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-text-tertiary">Cc</dt>
          <dd className="min-w-0 break-all text-foreground">{message.cc.join(', ')}</dd>
        </div>
      )}
      <div className="flex gap-3">
        <dt className="w-14 shrink-0 text-text-tertiary">Reply to</dt>
        <dd className="min-w-0 break-all text-foreground">{message.replyTo}</dd>
      </div>
      {message.status && (
        <div className="flex items-center gap-3">
          <dt className="w-14 shrink-0 text-text-tertiary">Status</dt>
          <dd className="flex items-center gap-2">
            <StatusToken {...messageStatusSpec(message.status)} />
            {message.sentAt && <span className="text-text-secondary">{formatSentAt(message.sentAt)}</span>}
          </dd>
        </div>
      )}
      {message.error && (
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-text-tertiary">Error</dt>
          <dd className="min-w-0 break-words text-[12px] text-accent-text">{message.error}</dd>
        </div>
      )}
    </dl>
  );
}

function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 280 });
  useEffect(() => adjustHeight(), [value, adjustHeight]);
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck
      className="mt-1.5 w-full resize-none border border-border bg-surface-inset px-3 py-3 font-sans text-[14px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
    />
  );
}

/** Internal rows stagger 30ms on entrance (DESIGN.md §8 `rail`). */
function Row({ children, delay, reduce }: { children: React.ReactNode; delay: number; reduce: boolean | null }) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 380, damping: 34, delay: delay * 0.03 }}
    >
      {children}
    </motion.div>
  );
}

export function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
