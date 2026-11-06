'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { applyCommands, placeholderScene, type Scene, type SceneCommand } from '@/lib/spacelab/studio/scene';
import type { ChatTurn } from '@/lib/spacelab/studio/chat';
import { FloorPlan } from './floor-plan';

/** three.js needs a window, so the render view never renders on the server. */
const RenderView = dynamic(() => import('./render-view').then((m) => m.RenderView), {
  ssr: false,
  loading: () => <p className="p-5 text-[13px] text-text-tertiary">Loading the room…</p>,
});

type Message = ChatTurn & { id: string };

const OPENING: Message = {
  id: 'm0',
  role: 'model',
  text: 'Describe the room or move something. "Put the sofa against the back wall, lamp to its left."',
};

const EYEBROW =
  'font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary';

/**
 * The studio: header, items rail with the floor plan under it, render window
 * on the right two-thirds, chat under the render. The scene document is the
 * only state the panels share; chat turns become SceneCommands through
 * /api/spacelab/chat and are applied here with the same reducer the server
 * validates against.
 */
export function SpacelabStudio({
  initialScene,
  order,
}: {
  initialScene?: Scene;
  /** The order this scene came from, for the header and the way back. */
  order?: { id: string };
} = {}) {
  const [scene, setScene] = useState<Scene>(() => initialScene ?? placeholderScene());
  const [messages, setMessages] = useState<Message[]>([OPENING]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const placedCount = Object.keys(scene.placements).length;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, { id: `u${m.length}`, role: 'user', text }]);
    setDraft('');
    setBusy(true);
    try {
      const res = await fetch('/api/spacelab/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene, history, message: text }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({ error: 'failed' }))) as { error?: string };
        throw new Error(error ?? 'failed');
      }
      const { reply, commands } = (await res.json()) as { reply: string; commands: SceneCommand[] };
      setScene((s) => applyCommands(s, commands).scene);
      setMessages((m) => [...m, { id: `r${m.length}`, role: 'model', text: reply }]);
    } catch (err) {
      const why = err instanceof Error ? err.message : 'failed';
      const text =
        why === 'not signed in'
          ? 'Sign in to talk to the model.'
          : why === 'rate_limited'
            ? 'Too many messages in a minute. Give it a moment.'
            : 'The model did not answer. Try again.';
      setMessages((m) => [...m, { id: `e${m.length}`, role: 'model', text }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_auto_auto_auto] md:grid-cols-[minmax(240px,1fr)_2fr] md:grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-end justify-between gap-4 border-b-[1.5px] border-ink px-5 py-4 md:col-span-2">
        <div>
          <p className={EYEBROW}>
            {order ? (
              <>
                <Link href={`/orders/${order.id}`} className="ink-underline hover:text-foreground">
                  Order #{order.id.slice(0, 8).toUpperCase()}
                </Link>
                {' · 3D'}
              </>
            ) : (
              'Prop Haus · 3D'
            )}
          </p>
          <h1 className="ad-headline mt-1 text-[40px] md:text-[56px]">Space Lab</h1>
        </div>
        <p className="hidden max-w-[320px] text-[13px] leading-[18px] text-text-secondary md:block">
          Arrange your order in a room by talking to it. The render on the right is the scene; the chat
          below moves it.
        </p>
      </header>

      <section
        aria-labelledby="items-heading"
        className="flex min-h-0 flex-col border-b-[1.5px] border-ink md:border-r-[1.5px]"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="items-heading" className={EYEBROW}>
            Items
          </h2>
          <span className="tag">
            {placedCount}/{scene.items.length} placed
          </span>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {scene.items.length === 0 && (
            <li className="px-5 py-4 text-[13px] leading-[18px] text-text-tertiary">Nothing on this order yet.</li>
          )}
          {scene.items.map((item) => {
            const placed = Boolean(scene.placements[item.id]);
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-border px-5 py-3 text-[13px] leading-[18px]"
              >
                <span
                  aria-hidden
                  className={placed ? 'size-2.5 shrink-0 bg-accent ring-1 ring-ink' : 'size-2.5 shrink-0 border border-ink'}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block truncate text-text-tertiary">{item.vendor}</span>
                </span>
                <span className={EYEBROW}>{placed ? 'In room' : 'Waiting'}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        aria-labelledby="render-heading"
        className="relative flex min-h-[320px] flex-col border-b-[1.5px] border-ink md:min-h-0"
      >
        <h2 id="render-heading" className={`${EYEBROW} absolute left-5 top-3 z-10`}>
          Render
        </h2>
        <div className="min-h-0 flex-1">
          <RenderView scene={scene} />
        </div>
      </section>

      <section
        aria-labelledby="floorplan-heading"
        className="flex flex-col border-b-[1.5px] border-ink md:border-b-0 md:border-r-[1.5px]"
      >
        <h2 id="floorplan-heading" className={`${EYEBROW} px-5 pt-3`}>
          Floor plan
        </h2>
        <div className="flex items-center justify-center px-5 pb-4 pt-2">
          <FloorPlan scene={scene} />
        </div>
      </section>

      <section aria-labelledby="chat-heading" className="flex flex-col">
        <h2 id="chat-heading" className={`${EYEBROW} px-5 pt-3`}>
          Chat
        </h2>
        <ol className="max-h-[200px] space-y-2 overflow-y-auto px-5 py-3" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className="text-[13px] leading-[18px]">
              <span className={`${EYEBROW} mr-2`}>{m.role === 'user' ? 'You' : 'Model'}</span>
              <span className={m.role === 'user' ? 'font-medium' : 'text-text-secondary'}>{m.text}</span>
            </li>
          ))}
          {busy && (
            <li className={`${EYEBROW} animate-pulse`} aria-label="Thinking">
              Thinking…
            </li>
          )}
        </ol>
        <form onSubmit={send} className="flex items-stretch border-t-[1.5px] border-ink bg-input">
          <label htmlFor="chat-draft" className="sr-only">
            Tell the model what to change
          </label>
          <input
            id="chat-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Move the sofa to the back wall…"
            autoComplete="off"
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent px-5 py-3 text-[14px] leading-[20px] outline-none placeholder:text-text-tertiary disabled:opacity-60"
          />
          <button type="submit" disabled={busy} className="tag lift-sm m-2 disabled:opacity-60">
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
