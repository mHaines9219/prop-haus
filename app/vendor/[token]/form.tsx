'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LineItem, LineStatus } from '@/lib/projects';

export function VendorResponseForm({ token, items }: { token: string; items: LineItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function update(item: LineItem, status: LineStatus, extra: { priceQuote?: number; subNote?: string } = {}) {
    setPending(item.itemId);
    await fetch(`/api/vendor/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: item.itemId, status, ...extra }),
    });
    setPending(null);
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Items requested</h2>
      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {items.map((item) => (
          <ItemRow key={item.itemId} item={item} pending={pending === item.itemId} onUpdate={update} />
        ))}
      </ul>
      <p className="font-sans text-xs text-ink/60">
        Click a status to record your response. Updates are saved immediately.
      </p>
    </section>
  );
}

function ItemRow({
  item,
  pending,
  onUpdate,
}: {
  item: LineItem;
  pending: boolean;
  onUpdate: (item: LineItem, status: LineStatus, extra?: { priceQuote?: number; subNote?: string }) => void;
}) {
  const [price, setPrice] = useState<string>(item.priceQuote?.toString() ?? '');
  const [subNote, setSubNote] = useState<string>(item.subNote ?? '');

  return (
    <li className="py-4 flex gap-4">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="w-24 h-24 object-cover bg-ink/5 shrink-0" />
      ) : (
        <div className="w-24 h-24 bg-ink/10 shrink-0" />
      )}
      <div className="flex-1 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-lg">{item.name}</p>
          <span className="font-sans text-xs uppercase tracking-widest text-ink/60">qty {item.qty}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-sans text-xs">
          <StatusButton
            label="Available"
            current={item.status === 'available'}
            disabled={pending}
            onClick={() => onUpdate(item, 'available', { priceQuote: price ? Number(price) : undefined })}
          />
          <StatusButton
            label="Substitution"
            current={item.status === 'sub'}
            disabled={pending}
            onClick={() => onUpdate(item, 'sub', { subNote: subNote || undefined, priceQuote: price ? Number(price) : undefined })}
          />
          <StatusButton
            label="Unavailable"
            current={item.status === 'unavailable'}
            disabled={pending}
            onClick={() => onUpdate(item, 'unavailable')}
          />
          <input
            type="number"
            placeholder="Price quote"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="border border-ink/30 px-2 py-1 bg-paper w-28"
          />
          {item.status === 'sub' && (
            <input
              type="text"
              placeholder="Substitution note"
              value={subNote}
              onChange={(e) => setSubNote(e.target.value)}
              className="border border-ink/30 px-2 py-1 bg-paper flex-1 min-w-[10rem]"
            />
          )}
        </div>

        {item.priceQuote !== undefined && (
          <p className="font-sans text-xs text-ink/60">
            Quoted: ${item.priceQuote.toFixed(2)} {item.subNote && `· ${item.subNote}`}
          </p>
        )}
      </div>
    </li>
  );
}

function StatusButton({
  label,
  current,
  disabled,
  onClick,
}: {
  label: string;
  current: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`uppercase tracking-widest px-3 py-1.5 border transition ${
        current
          ? 'bg-ink text-paper border-ink'
          : 'border-ink/30 hover:bg-ink hover:text-paper'
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}
