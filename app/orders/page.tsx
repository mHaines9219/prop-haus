import Link from 'next/link';
import { listOrders } from '@/lib/orders';
import { requireOrgId } from '@/lib/session';
import { SiteNav } from '@/components/ap/site-nav';
import { SiteFooter } from '@/components/ap/site-footer';

const STATUS_DOT: Record<string, string> = {
  placed:     'bg-yellow-400',
  processing: 'bg-blue-400',
  confirmed:  'bg-green-400',
  cancelled:  'bg-red-400',
};

export default async function OrdersPage() {
  const orgId = await requireOrgId('/orders');
  const orders = await listOrders(orgId);

  return (
    <div data-theme="answer-print" className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-12 md:py-16">

          <div className="mb-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Production sourcing
            </p>
            <h1 className="mt-2 font-display text-[32px] font-bold leading-tight tracking-[-0.01em] [font-stretch:125%]">
              Orders
            </h1>
          </div>

          {orders.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-[22px] font-bold [font-stretch:125%]">No orders yet</p>
              <p className="mt-2 text-[15px] text-text-secondary">
                Build a cart and place your first order.
              </p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-sm bg-foreground px-5 py-2.5 font-mono text-[13px] font-medium text-background transition-opacity hover:opacity-80"
              >
                Browse catalog
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => {
                const vendorCount = new Set(order.items.map((i) => i.vendor)).size;
                const placedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center gap-4 py-5 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-colors hover:bg-surface-raised"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[order.status] ?? 'bg-text-tertiary'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-snug">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] text-text-tertiary">
                        {placedDate} · {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {vendorCount} vendor{vendorCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-text-secondary shrink-0">
                      {order.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
