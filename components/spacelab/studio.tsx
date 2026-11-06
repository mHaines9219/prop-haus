'use client';

import { useState, type FormEvent } from 'react';

/** A thing in the scene: one line in the items rail. */
export type SceneItem = {
  id: string;
  name: string;
  vendor: string;
  /** Placed in the room, or still waiting in the rail. */
  placed: boolean;
};

/** One turn of the conversation that drives the scene. */
export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

/** Placeholder scene until an order feeds the studio. */
const PLACEHOLDER_ITEMS: SceneItem[] = [
  { id: 'i1', name: 'Tufted velvet sofa', vendor: 'Newel', placed: true },
  { id: 'i2', name: 'Brass floor lamp', vendor: 'Prop N Spoon', placed: true },
  { id: 'i3', name: 'Walnut coffee table', vendor: 'Eclectic', placed: true },
  { id: 'i4', name: 'Rattan armchair', vendor: 'Newel', placed: false },
  { id: 'i5', name: 'Ficus, 6 ft', vendor: 'Eclectic', placed: false },
  { id: 'i6', name: 'Shag rug, 8×10', vendor: 'Prop N Spoon', placed: false },
];

const OPENING_MESSAGE: ChatMessage = {
  id: 'm0',
  role: 'model',
  text: 'Describe the room or move something. "Put the sofa against the back wall, lamp to its left."',
};

const EYEBROW =
  'font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary';

/**
 * The studio: header, items rail with the floor plan under it, render window
 * on the right two-thirds, chat under the render. Everything is local state
 * and placeholder data; the render window and the model are not wired.
 */
export function SpacelabStudio() {
  const [items] = useState<SceneItem[]>(PLACEHOLDER_ITEMS);
  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE]);
  const [draft, setDraft] = useState('');
  const placed = items.filter((i) => i.placed).length;

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { id: `u${m.length}`, role: 'user', text },
      { id: `r${m.length}`, role: 'model', text: 'The model is not connected yet. This is the scaffold.' },
    ]);
    setDraft('');
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_auto_auto_auto] md:grid-cols-[minmax(240px,1fr)_2fr] md:grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-end justify-between gap-4 border-b-[1.5px] border-ink px-5 py-4 md:col-span-2">
        <div>
          <p className={EYEBROW}>Prop Haus · 3D</p>
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
            {placed}/{items.length} placed
          </span>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-border px-5 py-3 text-[13px] leading-[18px]"
            >
              <span
                aria-hidden
                className={
                  item.placed
                    ? 'size-2.5 shrink-0 bg-accent ring-1 ring-ink'
                    : 'size-2.5 shrink-0 border border-ink'
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block truncate text-text-tertiary">{item.vendor}</span>
              </span>
              <span className={EYEBROW}>{item.placed ? 'In room' : 'Waiting'}</span>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="render-heading"
        className="relative flex min-h-[320px] flex-col border-b-[1.5px] border-ink md:min-h-0"
      >
        <h2 id="render-heading" className={`${EYEBROW} absolute left-5 top-3`}>
          Render
        </h2>
        <div className="flex min-h-0 flex-1 items-center justify-center p-5 pt-10">
          <RenderPlaceholder />
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
          <FloorPlanSkeleton />
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
            className="min-w-0 flex-1 bg-transparent px-5 py-3 text-[14px] leading-[20px] outline-none placeholder:text-text-tertiary"
          />
          <button type="submit" className="tag lift-sm m-2">
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

/** An empty room drawn in ink: floor grid in one-point perspective, two walls. */
function RenderPlaceholder() {
  return (
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-label="Empty room. The scene renders here."
      className="h-full max-h-[520px] w-full max-w-[920px] border-[1.5px] border-ink bg-card"
    >
      <g stroke="var(--ink)" strokeWidth="1.5" fill="none">
        <path d="M0 240 L640 240" />
        <path d="M0 240 L220 120 L420 120 L640 240" />
        <path d="M220 0 L220 120" />
        <path d="M420 0 L420 120" />
      </g>
      <g stroke="var(--border)" strokeWidth="1" fill="none">
        {[80, 160, 240, 320, 400, 480, 560].map((x) => (
          <path key={x} d={`M${x} 360 L${220 + ((420 - 220) * x) / 640} 120`} />
        ))}
        {[150, 190, 260, 300].map((y) => (
          <path key={y} d={`M0 ${y} L640 ${y}`} />
        ))}
      </g>
      <text
        x="320"
        y="330"
        textAnchor="middle"
        fill="var(--text-tertiary)"
        fontSize="12"
        fontFamily="var(--font-body)"
        letterSpacing="1"
      >
        SCENE RENDERS HERE
      </text>
    </svg>
  );
}

/** The room's outline, top-down, with a door swing: the skeleton the scene stands on. */
function FloorPlanSkeleton() {
  return (
    <svg
      viewBox="0 0 200 120"
      role="img"
      aria-label="Floor plan: a rectangular room with one door"
      className="h-[120px] w-full max-w-[200px]"
    >
      <rect x="10" y="10" width="180" height="100" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M70 110 L100 110" stroke="var(--background)" strokeWidth="3" />
      <path d="M70 110 A30 30 0 0 1 100 80" fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 2" />
      <text x="100" y="64" textAnchor="middle" fill="var(--text-tertiary)" fontSize="9" fontFamily="var(--font-body)">
        18′ × 12′
      </text>
    </svg>
  );
}
