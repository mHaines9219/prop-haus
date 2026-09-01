'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { LightWell } from '@/components/ap/light-well';
import { isSafeExternalUrl } from '@/lib/safe-url';
import type { ProjectItemInput } from '@/lib/projects';
import { cn } from '@/lib/utils';

/**
 * "Add from the web" (MVP-7). Paste a product listing URL → the server fetches
 * and parses it (/api/clip) → confirm the preview → the item saves into this
 * folder through the existing items route. Clipped items are reference material
 * the user sourced themselves; they never enter the catalog, search, or cart.
 */

type ClipDraft = {
  itemId: string;
  source: 'clip';
  sourceId: string;
  sourceUrl: string;
  retailer: string;
};

type Phase =
  | 'idle'
  | 'fetching'
  | 'preview' // parsed; awaiting confirm
  | 'manual' // page unreadable; user types name/image
  | 'saving'
  | 'error';

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface-inset px-3 font-mono text-[13px] text-foreground placeholder:text-text-disabled focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30';

function formatPrice(price?: { amount: number; currency: string }): string | null {
  if (!price) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currency || 'USD',
      maximumFractionDigits: 2,
    }).format(price.amount);
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

export function ClipForm({
  projectId,
  existingItemIds,
}: {
  projectId: string;
  existingItemIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState('');
  const [item, setItem] = useState<ProjectItemInput | null>(null);
  const [draft, setDraft] = useState<ClipDraft | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualImage, setManualImage] = useState('');
  const [message, setMessage] = useState('');
  const [duplicate, setDuplicate] = useState(false);

  const existing = new Set(existingItemIds);

  function reset() {
    setPhase('idle');
    setUrl('');
    setItem(null);
    setDraft(null);
    setManualName('');
    setManualImage('');
    setMessage('');
    setDuplicate(false);
  }

  async function fetchPreview(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isSafeExternalUrl(trimmed)) {
      setPhase('error');
      setMessage('Paste a full http(s) product link.');
      return;
    }
    setPhase('fetching');
    setMessage('');
    setDuplicate(false);

    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (res.status === 429) {
        setPhase('error');
        setMessage('That’s a lot of clipping. Give it a few minutes and try again.');
        return;
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as { draft?: ClipDraft };
        if (!body.draft) throw new Error('unreadable');
        setDraft(body.draft);
        setDuplicate(existing.has(body.draft.itemId));
        setPhase('manual');
        return;
      }
      if (!res.ok) {
        setPhase('error');
        setMessage('That link can’t be reached. Check the URL or add the item by hand.');
        return;
      }

      const body = (await res.json()) as { item: ProjectItemInput };
      setItem(body.item);
      setDuplicate(existing.has(body.item.itemId));
      setPhase('preview');
    } catch {
      setPhase('error');
      setMessage('Something went wrong reading that page.');
    }
  }

  async function save(toSave: ProjectItemInput) {
    setPhase('saving');
    setMessage('');
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [toSave] }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!res.ok) {
        setPhase('error');
        setMessage('Couldn’t save that item. Try again.');
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setPhase('error');
      setMessage('Couldn’t save that item. Try again.');
    }
  }

  function saveManual(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const name = manualName.trim();
    if (!name) {
      setMessage('Give the item a name.');
      return;
    }
    const image = manualImage.trim();
    if (image && !isSafeExternalUrl(image)) {
      setMessage('The image link must be a full http(s) URL.');
      return;
    }
    void save({
      itemId: draft.itemId,
      source: 'clip',
      sourceId: draft.sourceId,
      name,
      ...(image ? { image } : {}),
      sourceUrl: draft.sourceUrl,
      meta: { retailer: draft.retailer },
    });
  }

  const price = formatPrice(item?.meta?.price);

  return (
    <div className="border-b border-border py-4">
      <button
        type="button"
        onClick={() => {
          if (open) reset();
          setOpen((v) => !v);
        }}
        className={cn(
          'h-9 rounded-md border px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] transition-colors duration-150',
          open
            ? 'border-border text-text-tertiary hover:text-foreground'
            : 'border-emerald-500 text-emerald-400 hover:bg-emerald-500/10',
        )}
      >
        {open ? 'Cancel' : 'Add from the web'}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              {/* URL input */}
              <form onSubmit={fetchPreview} className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a product link (e.g. wayfair.com/…)"
                  className={inputClass}
                  disabled={phase === 'fetching'}
                />
                <button
                  type="submit"
                  disabled={phase === 'fetching' || !url.trim()}
                  className="h-9 shrink-0 rounded-md border border-emerald-500 px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {phase === 'fetching' ? 'Reading…' : 'Fetch'}
                </button>
              </form>

              <p className="mt-2 font-mono text-[11px] leading-[16px] text-text-tertiary">
                Clipped items are your own reference — they link back to the retailer and don’t
                enter the catalog or cart.
              </p>

              {phase === 'error' && message && (
                <p className="mt-3 font-mono text-[12px] text-accent-text">{message}</p>
              )}

              {/* Parsed preview */}
              {phase === 'preview' && item && (
                <PreviewRow
                  image={item.image}
                  name={item.name}
                  retailer={item.meta?.retailer}
                  price={price}
                  duplicate={duplicate}
                  onSave={() => save(item)}
                  onDiscard={reset}
                />
              )}

              {phase === 'saving' && (
                <p className="mt-4 font-mono text-[12px] text-text-secondary">Saving…</p>
              )}

              {/* Unreadable-page fallback: manual entry, seeded with the URL */}
              {phase === 'manual' && draft && (
                <form onSubmit={saveManual} className="mt-4 flex flex-col gap-3">
                  <p className="font-mono text-[11px] leading-[16px] text-text-tertiary">
                    Couldn’t read {draft.retailer} automatically. Add the details by hand.
                  </p>
                  {duplicate && (
                    <p className="font-mono text-[11px] text-status-quoted">
                      This link is already in the folder — saving again won’t duplicate it.
                    </p>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                      Name
                    </span>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="What is it?"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                      Image URL (optional)
                    </span>
                    <input
                      type="url"
                      value={manualImage}
                      onChange={(e) => setManualImage(e.target.value)}
                      placeholder="https://…"
                      className={inputClass}
                    />
                  </label>
                  {message && <p className="font-mono text-[12px] text-accent-text">{message}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      className="h-9 rounded-md border border-emerald-500 px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-emerald-400 transition-colors hover:bg-emerald-500/10"
                    >
                      Save to folder
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors hover:text-foreground"
                    >
                      Discard
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreviewRow({
  image,
  name,
  retailer,
  price,
  duplicate,
  onSave,
  onDiscard,
}: {
  image?: string;
  name: string;
  retailer?: string;
  price: string | null;
  duplicate: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-5 border-t border-border pt-4">
      <div className="h-20 w-20 shrink-0">
        <LightWell src={image} alt={name} mode="photo" name={name} sizes="80px" fill />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-[22px] text-foreground">{name}</p>
        <p className="mt-0.5 font-mono text-[11px] leading-[14px] text-text-tertiary">
          {retailer}
          {price ? ` · ${price}` : ''}
        </p>
        {duplicate && (
          <p className="mt-1 font-mono text-[11px] text-status-quoted">Already in this folder</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          className="h-9 rounded-md border border-emerald-500 px-4 font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-emerald-400 transition-colors hover:bg-emerald-500/10"
        >
          {duplicate ? 'Save again' : 'Save to folder'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary transition-colors hover:text-foreground"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
