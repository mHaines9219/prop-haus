'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/cart-store';
import { SOURCE_META, type Source } from '@/lib/types';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';
import { ApiError, getJson, postJson } from '@/lib/api';
import { formatAddress, type OrderDefaults } from '@/lib/order-profile';

type CheckoutState = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

type Readiness =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'ready'; defaults: OrderDefaults & { rentalWindowDays?: number } }
  | { kind: 'incomplete'; missing: string[] };

export default function CartPage() {
  const router = useRouter();
  const { lines, remove, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [rentalStart, setRentalStart] = useState('');
  const [rentalEnd, setRentalEnd] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [override, setOverride] = useState(false);
  const [state, setState] = useState<CheckoutState>({ kind: 'idle' });
  const [readiness, setReadiness] = useState<Readiness>({ kind: 'loading' });
  // Stable key for the lifetime of this cart session — prevents double-submit.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    loadReadiness().then((r) => {
      if (!cancelled) setReadiness(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const vendors = Array.from(new Set(lines.map((l) => l.item.source)));

  async function handlePlaceOrder() {
    if (state.kind === 'submitting') return;
    setState({ kind: 'submitting' });

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
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 422
          ? 'Your order profile is missing something.'
          : 'Something went wrong — please try again.';
      setState({ kind: 'error', message });
      if (err instanceof ApiError && err.status === 422) setReadiness(await loadReadiness());
    }
  }

  // Avoid hydration mismatch — cart is persisted client-side.
  if (!mounted) return null;

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">

          {/* Page header */}
          <div className="mb-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              {lines.length} item{lines.length !== 1 ? 's' : ''}{vendors.length > 0 ? ` · ${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}` : ''}
            </p>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
              Cart
            </h1>
          </div>

          {lines.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-[22px] font-bold">Your cart is empty</p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Browse the catalog and add pieces from any vendor.
              </p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-md border border-foreground px-5 py-2.5 font-mono text-[13px] font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
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
                              className="h-24 w-24 rounded-md object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="block h-24 w-24 rounded-md bg-surface-raised" />
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
                <div className="rounded-md border border-border bg-surface-raised p-5">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Order details
                  </p>

                  {readiness.kind === 'ready' && (
                    <dl className="mt-4 space-y-3 font-mono text-[13px]">
                      <div>
                        <dt className="text-text-tertiary">Rental window</dt>
                        <dd className="mt-0.5 text-foreground">
                          {rentalStart || rentalEnd
                            ? formatWindow(rentalStart, rentalEnd)
                            : readiness.defaults.rentalStart && readiness.defaults.rentalEnd
                              ? `${formatWindow(readiness.defaults.rentalStart, readiness.defaults.rentalEnd)} · ${readiness.defaults.rentalWindowDays} days from the next business day`
                              : 'No default window — set one for this order'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-tertiary">Deliver to</dt>
                        <dd className="mt-0.5 text-foreground">
                          {readiness.defaults.deliveryAddress
                            ? formatAddress(readiness.defaults.deliveryAddress)
                            : readiness.defaults.deliveryNotes ?? '—'}
                        </dd>
                        {readiness.defaults.deliveryAddress && readiness.defaults.deliveryNotes && !deliveryNotes && (
                          <dd className="mt-0.5 text-text-secondary">{readiness.defaults.deliveryNotes}</dd>
                        )}
                        {deliveryNotes && <dd className="mt-0.5 text-text-secondary">{deliveryNotes}</dd>}
                      </div>
                    </dl>
                  )}

                  {readiness.kind === 'incomplete' && (
                    <div className="mt-4">
                      <p className="font-mono text-[13px] text-foreground">
                        {readiness.missing.length} thing{readiness.missing.length !== 1 ? 's' : ''} missing before
                        one-click
                      </p>
                      <ul className="mt-2 space-y-1 font-mono text-[12px] text-text-secondary">
                        {readiness.missing.map((m) => (
                          <li key={m}>· {m}</li>
                        ))}
                      </ul>
                      <Link
                        href="/account/profile"
                        className="mt-4 inline-block font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-accent-text underline underline-offset-4"
                      >
                        Complete your order profile →
                      </Link>
                    </div>
                  )}

                  {readiness.kind === 'anon' && (
                    <p className="mt-4 font-mono text-[13px] text-text-secondary">
                      <Link href="/login?next=/cart" className="text-accent-text underline underline-offset-4">
                        Sign in
                      </Link>{' '}
                      to place an order.
                    </p>
                  )}

                  {readiness.kind === 'loading' && (
                    <p className="mt-4 font-mono text-[13px] text-text-tertiary">Reading your profile…</p>
                  )}

                  {readiness.kind === 'ready' && (
                    <div className="mt-4 border-t border-border pt-4">
                      <button
                        type="button"
                        onClick={() => setOverride((o) => !o)}
                        className="font-mono text-[12px] text-text-tertiary underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {override ? 'Use my defaults' : 'Change for this order'}
                      </button>
                      {override && (
                        <div className="mt-4 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block font-mono text-[12px] text-text-secondary mb-1.5">
                                Start
                              </label>
                              <input
                                type="date"
                                value={rentalStart}
                                onChange={(e) => setRentalStart(e.target.value)}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
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
                                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
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
                              placeholder="Access instructions, who to ask for…"
                              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-foreground"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-baseline justify-between border-b border-border pb-3">
                  <span className="text-[13px] text-text-tertiary">Estimate, pending vendor quotes</span>
                  <span className="font-mono text-[13px] font-medium text-foreground">—</span>
                </div>

                {state.kind === 'error' && (
                  <p className="font-mono text-[12px] text-[#a8ff3e]">{state.message}</p>
                )}

                {readiness.kind === 'ready' && (
                  <button
                    onClick={handlePlaceOrder}
                    disabled={state.kind === 'submitting'}
                    className="w-full rounded-md border border-foreground py-3 font-mono text-[13px] font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {state.kind === 'submitting' ? 'Placing order…' : 'Place order'}
                  </button>
                )}

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

async function loadReadiness(): Promise<Readiness> {
  try {
    const r = await getJson<{
      ready: boolean;
      missing: string[];
      defaults: OrderDefaults & { rentalWindowDays?: number };
    }>('/api/checkout/readiness');
    return r.ready ? { kind: 'ready', defaults: r.defaults } : { kind: 'incomplete', missing: r.missing };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { kind: 'anon' };
    return { kind: 'incomplete', missing: ['Order profile could not be read'] };
  }
}

/** "Sep 3 – Sep 10, 2026" from two ISO dates; tolerates one side missing. */
function formatWindow(start: string, end: string): string {
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(year ? { year: 'numeric' } : {}),
    });
  if (start && end) return `${fmt(start, false)} – ${fmt(end, true)}`;
  return start ? `From ${fmt(start, true)}` : `Until ${fmt(end, true)}`;
}
