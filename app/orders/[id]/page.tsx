/**
 * /orders/[id] — the job detail view (MVP-8).
 *
 * An order enriched into a job: line items grouped by vendor with per-vendor
 * rollups and per-item StatusTokens, the COIs issued for the order, and an
 * order-level status header. /jobs rows link here; there is no separate
 * /jobs/[id].
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobDetail } from '@/lib/jobs';
import { getSceneForOrder } from '@/lib/spacelab/handoff';
import type { OrderItem, VendorSummary } from '@/lib/orders';
import { requireOrgId } from '@/lib/session';
import { PageShell } from '@/components/ap/page-shell';
import { LightWell } from '@/components/ap/light-well';
import { SpacelabPanel } from '@/components/ap/spacelab-panel';
import {
  StatusToken,
  orderStatusSpec,
  itemStatusSpec,
  coiStatusSpec,
} from '@/components/ap/status-token';

type Props = { params: Promise<{ id: string }> };

export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  const orgId = await requireOrgId(`/orders/${id}`);

  const detail = await getJobDetail(id, orgId);
  if (!detail) notFound();

  // FUT-2: the set preview, if this order already has a room prepared (checkout
  // warms one). Never fatal to the page — an order detail that 500s because a
  // 3D preview could not be read is a worse trade than a missing panel.
  const scene = await getSceneForOrder(id, orgId).catch(() => null);

  const { order, vendorSummaries, certificates } = detail;

  const vendorCount = vendorSummaries.length;
  const placedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Group items by vendor so each rollup line sits above its lines.
  const byVendor = new Map<string, OrderItem[]>();
  for (const item of order.items) {
    byVendor.set(item.vendor, [...(byVendor.get(item.vendor) ?? []), item]);
  }
  const summaryByVendor = new Map(vendorSummaries.map((s) => [s.vendor, s]));

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">
        {/* Header */}
        <div className="mb-10">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Job detail
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.01em]">
              #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <StatusToken {...orderStatusSpec(order.status)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[13px] text-text-secondary">
            <span>{placedDate}</span>
            <span className="text-text-tertiary">·</span>
            <span>
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} from {vendorCount} vendor
              {vendorCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Rental window */}
        {(order.rentalStart || order.rentalEnd) && (
          <div className="mb-8 rounded-md border border-border bg-surface-raised p-5">
            <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Rental window
            </p>
            <div className="flex flex-wrap gap-8 font-mono text-[13px]">
              {order.rentalStart && (
                <div>
                  <p className="text-text-tertiary">Start</p>
                  <p className="mt-1 font-medium">{order.rentalStart}</p>
                </div>
              )}
              {order.rentalEnd && (
                <div>
                  <p className="text-text-tertiary">End</p>
                  <p className="mt-1 font-medium">{order.rentalEnd}</p>
                </div>
              )}
            </div>
            {order.deliveryNotes && (
              <p className="mt-4 font-mono text-[12px] text-text-secondary">{order.deliveryNotes}</p>
            )}
          </div>
        )}

        {/* Items grouped by vendor */}
        {[...byVendor.entries()].map(([vendor, items]) => {
          const summary = summaryByVendor.get(vendor);
          return (
            <div key={vendor} className="mb-8">
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <h2 className="font-heading text-[15px] font-bold tracking-[-0.02em]">{vendor}</h2>
                {summary && (
                  <p className="font-mono text-[12px] tabular-nums text-text-tertiary">
                    {vendorRollup(summary)}
                  </p>
                )}
              </div>
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <OrderItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Certificates */}
        {certificates.length > 0 && (
          <div className="mb-8">
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <h2 className="font-heading text-[15px] font-bold tracking-[-0.02em]">Certificates</h2>
              <Link
                href="/account/insurance"
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
              >
                Ledger
              </Link>
            </div>
            <div className="divide-y divide-border">
              {certificates.map((cert) => (
                <div key={cert.id} className="flex items-center gap-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-sans text-[14px]">
                    {cert.vendorName}
                  </span>
                  <StatusToken {...coiStatusSpec(cert.status)} />
                  {cert.documentUrl && (
                    <a
                      href={cert.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                    >
                      PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FUT-2 — Spacelab set preview */}
        <SpacelabPanel orderId={order.id} initialScene={scene} />

        {/* Footer actions */}
        <div className="mt-10 flex gap-3">
          <Link
            href="/jobs"
            className="rounded-md border border-border px-4 py-2.5 font-mono text-[13px] text-foreground transition-colors hover:bg-surface-raised"
          >
            All jobs
          </Link>
          <Link
            href="/search"
            className="rounded-md border border-accent px-4 py-2.5 font-mono text-[13px] text-accent-text transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Browse catalog
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function OrderItemRow({ item }: { item: OrderItem }) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md">
        <LightWell src={item.image} alt={item.name} mode="photo" fill name={item.name} />
      </div>
      <div className="min-w-0 flex-1">
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium leading-snug hover:underline"
        >
          {item.name}
        </a>
        {item.statusNote && (
          <p className="mt-1 font-mono text-[12px] text-text-tertiary">{item.statusNote}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {item.status === 'quoted' && item.quotedCents != null && (
          <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">
            ${(item.quotedCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        )}
        <StatusToken {...itemStatusSpec(item.status)} />
      </div>
    </div>
  );
}

/** "4 of 6 confirmed · 2 pending" — the per-vendor rollup line. */
function vendorRollup(s: VendorSummary): string {
  const parts = [`${s.confirmed} of ${s.total} confirmed`];
  const pending = s.pending + s.quoted;
  if (pending > 0) parts.push(`${pending} pending`);
  if (s.unavailable > 0) parts.push(`${s.unavailable} unavailable`);
  return parts.join(' · ');
}
