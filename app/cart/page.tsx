'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-store';
import { useProfile } from '@/lib/profile-store';
import { checkCompatibility } from '@/lib/insurance';
import { SOURCE_META, type Source } from '@/lib/types';
import { CoiBadge } from '@/components/coi-badge';

export default function CartPage() {
  const { lines, remove, setQty, startDate, endDate, setDates, clear } = useCart();
  const { profile } = useProfile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const vendorSources = Array.from(new Set(lines.map((l) => l.item.source))) as Source[];
  const vendorCount = vendorSources.length;
  const shootDates = startDate && endDate ? { start: startDate, end: endDate } : null;
  const compat = vendorSources.map((src) => ({
    source: src,
    result: checkCompatibility(profile?.policy, src, shootDates),
  }));
  const hasGap = compat.some((c) => c.result.status === 'gap');

  if (!mounted) return <p className="font-sans text-ink/60">Loading…</p>;

  if (lines.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <h1 className="font-display text-4xl">Your cart is empty</h1>
        <Link
          href="/"
          className="inline-block font-sans uppercase tracking-widest text-sm border border-ink/40 px-4 py-2"
        >
          Browse catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="font-display text-4xl">Quote Request</h1>

      <div className="grid grid-cols-2 gap-4">
        <label className="font-sans text-sm space-y-1">
          <span className="block uppercase text-[10px] tracking-widest text-ink/50">Start date</span>
          <input
            type="date"
            value={startDate ?? ''}
            onChange={(e) => setDates(e.target.value || null, endDate)}
            className="border border-ink/30 px-3 py-2 w-full bg-paper"
          />
        </label>
        <label className="font-sans text-sm space-y-1">
          <span className="block uppercase text-[10px] tracking-widest text-ink/50">End date</span>
          <input
            type="date"
            value={endDate ?? ''}
            onChange={(e) => setDates(startDate, e.target.value || null)}
            className="border border-ink/30 px-3 py-2 w-full bg-paper"
          />
        </label>
      </div>

      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {lines.map((line) => (
          <li key={line.item.id} className="flex gap-4 py-4">
            <Link
              href={`/item/${line.item.source}/${encodeURIComponent(line.item.sourceId)}`}
              className="shrink-0"
            >
              {line.item.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.item.images[0]} alt="" className="w-24 h-24 object-cover bg-ink/5" />
              ) : (
                <div className="w-24 h-24 bg-ink/10" />
              )}
            </Link>
            <div className="flex-1">
              <Link
                href={`/item/${line.item.source}/${encodeURIComponent(line.item.sourceId)}`}
                className="font-display text-lg"
              >
                {line.item.name}
              </Link>
              <p className="font-sans text-xs uppercase tracking-widest text-ink/50 mt-0.5">
                {line.item.source}
              </p>
              <div className="flex items-center gap-3 mt-2 font-sans text-sm">
                <label className="flex items-center gap-2">
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(e) => setQty(line.item.id, Number(e.target.value))}
                    className="w-16 border border-ink/30 px-2 py-1 bg-paper"
                  />
                </label>
                <button
                  onClick={() => remove(line.item.id)}
                  className="text-ink/60 hover:text-ink underline"
                >
                  remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="border border-ink/15 p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">Insurance check</h2>
          {profile?.policy ? (
            <Link
              href="/onboarding/insurance?next=/cart"
              className="font-sans text-xs uppercase tracking-widest text-ink/60 underline"
            >
              Edit
            </Link>
          ) : (
            <Link
              href="/onboarding/insurance?next=/cart"
              className="font-sans text-xs uppercase tracking-widest border border-ink/40 px-3 py-1 hover:bg-ink hover:text-paper transition"
            >
              Add insurance
            </Link>
          )}
        </div>
        {!profile?.policy && (
          <p className="font-sans text-xs text-ink/60">
            Add your business policy once and we&rsquo;ll check every vendor against your coverage.
          </p>
        )}
        <ul className="divide-y divide-ink/10">
          {compat.map(({ source, result }) => (
            <li key={source} className="py-2 flex items-center justify-between gap-3">
              <span className="font-sans text-sm">{SOURCE_META[source]?.name ?? source}</span>
              <div className="flex items-center gap-3">
                {result.issues.length > 0 && (
                  <span className="font-sans text-xs text-ink/60">
                    {result.issues
                      .slice(0, 2)
                      .map((i) => i.field)
                      .join(', ')}
                    {result.issues.length > 2 && ` +${result.issues.length - 2}`}
                  </span>
                )}
                <CoiBadge result={result} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between gap-4">
        <button onClick={clear} className="font-sans text-sm text-ink/60 underline">
          Clear cart
        </button>
        <div className="text-right space-y-2">
          <p className="font-sans text-xs uppercase tracking-widest text-ink/50">
            {lines.length} item{lines.length === 1 ? '' : 's'} · {vendorCount} vendor
            {vendorCount === 1 ? '' : 's'}
            {hasGap && ' · coverage gap'}
          </p>
          <Link
            href="/request/new"
            className="inline-block font-sans uppercase tracking-widest text-sm px-5 py-3 bg-ink text-paper hover:bg-accent transition"
          >
            Continue to project request →
          </Link>
        </div>
      </div>
    </div>
  );
}
