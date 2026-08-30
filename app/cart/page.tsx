'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart-store';
import { SOURCE_META, type Source } from '@/lib/types';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { postJson } from '@/lib/api';

type CheckoutState = 'idle' | 'submitting' | 'error';

export default function CartPage() {
  const router = useRouter();
  const { lines, remove, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [rentalStart, setRentalStart] = useState('');
  const [rentalEnd, setRentalEnd] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [state, setState] = useState<CheckoutState>('idle');
  // Stable key for the lifetime of this cart session — prevents double-submit.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const vendors = Array.from(new Set(lines.map((l) => l.item.source)));

  async function handlePlaceOrder() {
    if (state === 'submitting') return;
    setState('submitting');

    try {
      const { id } = await postJson<{ id: string }>('/api/checkout', {
        lines: lines.map((l) => ({
          itemId: l.item.id,
          source: l.item.source,
          sourceId: l.item.sourceId,
          name: l.item.name,
          image: l.item.images[0] ?? null,
          sourceUrl: l.item.sourceUrl,
          vendor: SOURCE_META[l.item.source as Source]?.name ?? l.item.source,
        })),
        rentalStart: rentalStart || undefined,
        rentalEnd: rentalEnd || undefined,
        deliveryNotes: deliveryNotes.trim() || undefined,
        idempotencyKey,
      });

      clear();
      router.push(`/orders/${id}`);
    } catch {
      setState('error');
    }
  }

  // Avoid hydration mismatch — cart is persisted client-side.
  if (!mounted) return null;

  return (
    <div data-theme="answer-print" className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">

          {/* Page header */}
          <div className="mb-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              {lines.length} item{lines.length !== 1 ? 's' : ''}{vendors.length > 0 ? ` · ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}` : ''}
            </p>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em] [font-stretch:125%]">
              Cart
            </h1>
          </div>

          {lines.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-[22px] font-bold [font-stretch:125%]">Your cart is empty</p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Browse the catalog and add pieces from any vendor.
              </p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-sm bg-foreground px-5 py-2.5 font-mono text-[13px] font-medium text-background transition-opacity hover:opacity-80"
              >
                Browse catalog
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px] lg:items-start">

              {/* Item list */}
              <div>
                <div className="divide-y divide-border">
                  {lines.map((line) => {
                    const href = `/item/${line.item.source}/${encodeURIComponent(line.item.sourceId)}`;
                    const vendorName = SOURCE_META[line.item.source as Source]?.name ?? line.item.source;
                    return (
                      <div key={line.item.id} className="flex gap-4 py-5">
                        <Link href={href} className="shrink-0">
                          {line.item.images[0] ? (
                            <Image
                              src={line.item.images[0]}
                              alt={line.item.name}
                              width={96}
                              height={96}
                              className="h-24 w-24 object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="block h-24 w-24 bg-surface-raised" />
                          )}
                        </Link>
                        <div className="flex flex-1 flex-col justify-between py-0.5">
                          <div>
                            <Link href={href} className="font-medium leading-snug hover:underline">
                              {line.item.name}
                            </Link>
                            <p className="mt-1 font-mono text-[12px] text-text-tertiary">{vendorName}</p>
                          </div>
                          <button
                            onClick={() => remove(line.item.id)}
                            className="self-start font-mono text-[12px] text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <button
                    onClick={clear}
                    className="font-mono text-[12px] text-text-tertiary underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear cart
                  </button>
                </div>
              </div>

              {/* Checkout panel */}
              <div className="space-y-5">
                <div className="rounded-sm border border-border bg-surface-raised p-5 space-y-4">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Rental window
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[12px] text-text-secondary mb-1.5">
                        Start
                      </label>
                      <input
                        type="date"
                        value={rentalStart}
                        onChange={(e) => setRentalStart(e.target.value)}
                        className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                      />
                    </div>
                    <div>
                      <label className="block font-mono text-[12px] text-text-secondary mb-1.5">
                        End
                      </label>
                      <input
                        type="date"
                        value={rentalEnd}
                        onChange={(e) => setRentalEnd(e.target.value)}
                        className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-mono text-[12px] text-text-secondary mb-1.5">
                      Delivery notes
                    </label>
                    <textarea
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      rows={2}
                      placeholder="Address, contact, access instructions…"
                      className="w-full resize-none rounded-sm border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-foreground"
                    />
                  </div>
                </div>

                {state === 'error' && (
                  <p className="font-mono text-[12px] text-red-500">
                    Something went wrong — please try again.
                  </p>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={state === 'submitting'}
                  className="w-full rounded-sm bg-foreground py-3 font-mono text-[13px] font-medium text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state === 'submitting' ? 'Placing order…' : 'Place order'}
                </button>

                <p className="font-mono text-[11px] text-text-tertiary leading-relaxed">
                  Pricing is confirmed with each vendor after you place your order.
                  Payment is not collected at checkout.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
