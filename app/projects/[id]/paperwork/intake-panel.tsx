'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, postJson } from '@/lib/api';
import type { IntakeTurn } from '@/lib/intake/turn';
import type { ProfileFact } from '@/lib/project-profile';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

/**
 * The intake conversation and the profile it builds. Every turn posts to the
 * intake route; the reply and the facts come back with it, and the checklist
 * on the right re-renders through router.refresh().
 */
export function IntakePanel({
  projectId,
  initialMessages,
  initialFacts,
  initialQuestions,
  provider,
}: {
  projectId: string;
  initialMessages: Message[];
  initialFacts: ProfileFact[];
  initialQuestions: string[];
  provider: 'mock' | 'openrouter';
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [facts, setFacts] = useState<ProfileFact[]>(initialFacts);
  const [questions, setQuestions] = useState<string[]>(initialQuestions);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: message }]);
    setDraft('');
    try {
      const turn = await postJson<IntakeTurn>(`/api/projects/${projectId}/intake`, { message });
      setMessages((m) => [...m, { id: `local-${Date.now()}-a`, role: 'assistant', content: turn.reply }]);
      setFacts(turn.facts);
      setQuestions(turn.questions.map((q) => q.question));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      setError('That did not go through. Try again.');
      setDraft(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-baseline justify-between border-b border-border pb-2">
          <h2 className="text-[18px] font-semibold leading-[24px] text-foreground">Tell us about the production</h2>
          {provider === 'mock' && (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary" title="Set OPENROUTER_API_KEY to use the model">
              Mock intake
            </span>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Nothing described yet
              </p>
              <p className="mt-2 text-[15px] leading-[22px] text-text-secondary">
                Say what you are making, where, with how many people, and what you are renting. The checklist builds itself
                from the facts.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {messages.map((m) => (
                <li key={m.id} className="py-3">
                  <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                    {m.role === 'user' ? 'You' : 'Prop Haus'}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] leading-[22px] text-foreground">{m.content}</p>
                </li>
              ))}
              {busy && (
                <li className="py-3">
                  <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
                    Prop Haus
                  </p>
                  <p className="mt-1 font-mono text-[13px] text-text-tertiary">Reading that</p>
                </li>
              )}
              <div ref={endRef} />
            </ol>
          )}
        </div>

        <form onSubmit={send} className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              messages.length === 0
                ? 'I’m producing a 10-day indie film in Brooklyn. 15 crew, two locations, renting props from three vendors, one child actor, a stunt scene, a rented box truck.'
                : questions[0] ?? 'Anything else about the production'
            }
            rows={3}
            maxLength={4000}
            disabled={busy}
            aria-label="Describe the production"
            className="w-full resize-none rounded-md border border-border bg-surface-inset px-3 py-2 font-mono text-[13px] leading-[19px] text-foreground placeholder:text-text-disabled focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              Facts you state become the project profile. Nothing else is stored.
            </p>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="h-9 shrink-0 rounded-md bg-primary px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? 'Sending' : 'Send'}
            </button>
          </div>
          {error && <p className="font-mono text-[12px] text-accent-text">{error}</p>}
        </form>
      </section>

      <section>
        <div className="border-b border-border pb-2">
          <h2 className="text-[18px] font-semibold leading-[24px] text-foreground">Project profile</h2>
        </div>
        {facts.length === 0 ? (
          <p className="py-4 font-mono text-[13px] text-text-tertiary">Nothing on file yet.</p>
        ) : (
          <dl className="divide-y divide-border">
            {facts.map((f) => (
              <div key={f.label} className="flex min-h-[40px] items-center justify-between gap-4 py-2">
                <dt className="text-[13px] leading-[19px] text-text-tertiary">{f.label}</dt>
                <dd className="text-right font-mono text-[13px] leading-[18px] text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {questions.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
              Still open
            </p>
            <ul className="mt-2 space-y-1">
              {questions.map((q) => (
                <li key={q} className="text-[13px] leading-[19px] text-text-secondary">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
